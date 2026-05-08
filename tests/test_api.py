def test_api_health(client):
    response = client.get('/api/health')
    assert response.status_code in [200, 503]
    json_data = response.get_json()
    assert "status" in json_data


def test_api_graph_payload_contract(client):
    response = client.get("/api/graph")
    assert response.status_code == 200
    assert "max-age=300" in response.headers.get("Cache-Control", "")
    payload = response.get_json()

    assert isinstance(payload, dict)
    assert payload.get("status") == "ok"
    assert isinstance(payload.get("nodes"), list)
    assert isinstance(payload.get("edges"), list)
    assert isinstance(payload.get("communities"), list)
    assert isinstance(payload.get("timeline"), dict)

    nodes = payload["nodes"]
    edges = payload["edges"]
    node_ids = {node["id"] for node in nodes if "id" in node}
    assert node_ids
    assert all("details_html" not in node for node in nodes)

    for edge in edges:
        assert "source" in edge
        assert "target" in edge
        assert "flow_kind" in edge
        assert "kind" not in edge
        assert edge["source"] in node_ids
        assert edge["target"] in node_ids
