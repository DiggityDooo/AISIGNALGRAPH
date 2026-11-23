import json
from dataclasses import replace

import pytest

from scraper.storage import StoryStorage
from webapp.loader import DataLoader
from webapp.safety import safety_feed, source_link


@pytest.mark.parametrize("value", ["javascript:alert(1)", "//ftc.gov/case", "https://ftc.gov@invalid.test/x", "https://[", "https://unexpected.test\\@ftc.gov/case"])
def test_unusable_publisher_link(value):
    assert source_link(value) is None


def test_categories_and_attribution(graph_store):
    story = graph_store.get_story("story-ai-safety-summit")
    report = replace(story, title="FTC announces a complaint", id="case",
                     source_url="https://www.ftc.gov/news-events/news/press-releases/example",
                     event_date="2025-02-11")
    advisory = replace(story, id="guide", source_url="https://consumer.ftc.gov/consumer-alerts/example",
                       event_date="2025-03-20")
    mention = replace(report, id="coverage", title="AI safety research", source_url="https://ftc.gov.example.org/story")
    news = replace(report, id="news", source_url="https://example.org/report")
    unrelated = graph_store.get_story("story-gpt4")
    records = safety_feed([unrelated, story, report, advisory, mention, news])
    assert records[0]["id"] == "guide"
    assert {r["id"]: r["section"] for r in records} == {
        "case": "conduct", "news": "conduct", "guide": "guidance", "coverage": "awareness", story.id: "awareness",
    }
    assert next(r for r in records if r["id"] == "case")["entities"] == story.entities


def test_existing_install_picks_up_new_seed_and_ingested_stories(graph_store, tmp_path):
    seed = tmp_path / "seed.json"
    store = StoryStorage(bucket_name="", stories_path=tmp_path / "feed.json")
    loader = DataLoader(storage=store, seed_path=seed)
    with graph_store._connect() as conn:
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('seed_loaded', '1')")
        conn.commit()
        seed.write_text(json.dumps([{
            "id": "new-guide", "title": "Advice on voice cloning", "date": "2025-03-01",
            "source_url": "https://consumer.ftc.gov/consumer-alerts/guide",
        }]), encoding="utf-8")
        assert loader.load_seed(conn) == 1
        assert loader.load_seed(conn) == 0
        assert "new-guide" in {r["id"] for r in safety_feed(graph_store.list_stories())}
        store.save_stories([{
            "id": "new-case", "title": "FTC announces AI settlement", "date": "2025-04-01",
            "source_url": "https://www.ftc.gov/news-events/news/press-releases/case",
            "entities": [{"name": "Example Company", "type": "company"}],
        }])
        assert loader.load_stories(conn) == 1
    first = safety_feed(graph_store.list_stories())[0]
    assert (first["id"], first["section"]) == ("new-case", "conduct")
    assert first["entities"][0]["id"] == "example-company"


def test_public_feed_and_linked_documents(client):
    response = client.get("/api/safety")
    assert response.status_code == 200
    records = response.get_json()["records"]
    case = next(r for r in records if r["id"] == "ftc-workado-detection-order")
    assert case["section"] == "conduct"
    assert client.get("/stories/" + case["id"]).status_code == 200
    assert client.get("/entities/workado").status_code == 200
