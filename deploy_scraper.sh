PROJECT=$(gcloud config get-value project)
REGION=us-west1
# Four runs/day, spread ~6h apart (UTC). Each job capped at 15m.
SCRAPER_SCHEDULE="0 2,8,14,20 * * *"
SCRAPER_TASK_TIMEOUT=15m

# 1. GCS bucket for stories + state (using || true to ignore if already made)
gcloud storage buckets create gs://${PROJECT}-aisignal-stories \
  --location=$REGION --uniform-bucket-level-access || true

# 2. Service account for the job
gcloud iam service-accounts create aisignal-scraper || true
SA=aisignal-scraper@${PROJECT}.iam.gserviceaccount.com

gcloud storage buckets add-iam-policy-binding gs://${PROJECT}-aisignal-stories \
  --member=serviceAccount:$SA --role=roles/storage.objectAdmin

gcloud secrets add-iam-policy-binding gemini-api-key \
  --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor

# 3. Build + deploy the scraper job
# Swap in the scraper Dockerfile temporarily; restore the web Dockerfile after.
mv Dockerfile Dockerfile.web.bak
cp Dockerfile.scraper Dockerfile
gcloud builds submit --tag $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/aisignal-scraper:latest .
rm Dockerfile
mv Dockerfile.web.bak Dockerfile

IMAGE=$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/aisignal-scraper:latest

# Update if job exists; create on first deploy.
if gcloud run jobs describe aisignal-scraper --region $REGION >/dev/null 2>&1; then
  gcloud run jobs update aisignal-scraper \
    --image $IMAGE \
    --region $REGION --service-account $SA \
    --set-env-vars STORIES_BUCKET=${PROJECT}-aisignal-stories \
    --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
    --max-retries 1 --task-timeout $SCRAPER_TASK_TIMEOUT
else
  gcloud run jobs create aisignal-scraper \
    --image $IMAGE \
    --region $REGION --service-account $SA \
    --set-env-vars STORIES_BUCKET=${PROJECT}-aisignal-stories \
    --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
    --max-retries 1 --task-timeout $SCRAPER_TASK_TIMEOUT
fi

# 4. Pre-emptively enable Scheduler API to prevent prompt hanging
gcloud services enable cloudscheduler.googleapis.com

SCHEDULER_URI="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/aisignal-scraper:run"
SCHEDULER_JOB=aisignal-scraper-schedule

if gcloud scheduler jobs describe $SCHEDULER_JOB --location $REGION >/dev/null 2>&1; then
  gcloud scheduler jobs update http $SCHEDULER_JOB \
    --location $REGION --schedule "$SCRAPER_SCHEDULE" \
    --uri "$SCHEDULER_URI" \
    --http-method POST --oauth-service-account-email $SA
elif gcloud scheduler jobs describe aisignal-scraper-nightly --location $REGION >/dev/null 2>&1; then
  gcloud scheduler jobs update http aisignal-scraper-nightly \
    --location $REGION --schedule "$SCRAPER_SCHEDULE" \
    --uri "$SCHEDULER_URI" \
    --http-method POST --oauth-service-account-email $SA
else
  gcloud scheduler jobs create http $SCHEDULER_JOB \
    --location $REGION --schedule "$SCRAPER_SCHEDULE" \
    --uri "$SCHEDULER_URI" \
    --http-method POST --oauth-service-account-email $SA
fi

gcloud projects add-iam-policy-binding $PROJECT \
  --member=serviceAccount:$SA --role=roles/run.invoker

# 5. Web app reads the bucket: add env + GCS read to existing service
gcloud run services update aisignalgraph --region $REGION \
  --set-env-vars STORIES_BUCKET=${PROJECT}-aisignal-stories

# Grant the *web* service's runtime SA objectViewer on the bucket:
gcloud storage buckets add-iam-policy-binding gs://${PROJECT}-aisignal-stories \
  --member=serviceAccount:$(gcloud run services describe aisignalgraph --region $REGION --format 'value(spec.template.spec.serviceAccountName)') \
  --role=roles/storage.objectViewer