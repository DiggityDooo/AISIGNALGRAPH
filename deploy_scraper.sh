PROJECT=$(gcloud config get-value project)
REGION=us-west1

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

gcloud run jobs create aisignal-scraper \
  --image $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/aisignal-scraper:latest \
  --region $REGION --service-account $SA \
  --set-env-vars STORIES_BUCKET=${PROJECT}-aisignal-stories \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --max-retries 1 --task-timeout 20m

# 4. Pre-emptively enable Scheduler API to prevent prompt hanging
gcloud services enable cloudscheduler.googleapis.com

# Nightly schedule (2 AM UTC)
gcloud scheduler jobs create http aisignal-scraper-nightly \
  --location $REGION --schedule "0 2 * * *" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/aisignal-scraper:run" \
  --http-method POST --oauth-service-account-email $SA || true

gcloud projects add-iam-policy-binding $PROJECT \
  --member=serviceAccount:$SA --role=roles/run.invoker

# 5. Web app reads the bucket: add env + GCS read to existing service
gcloud run services update aisignalgraph --region $REGION \
  --set-env-vars STORIES_BUCKET=${PROJECT}-aisignal-stories

# Grant the *web* service's runtime SA objectViewer on the bucket:
gcloud storage buckets add-iam-policy-binding gs://${PROJECT}-aisignal-stories \
  --member=serviceAccount:$(gcloud run services describe aisignalgraph --region $REGION --format 'value(spec.template.spec.serviceAccountName)') \
  --role=roles/storage.objectViewer