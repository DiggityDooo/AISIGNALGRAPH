def test_api_health(client):
    response = client.get('/api/health')
    assert response.status_code in [200, 503]
    json_data = response.get_json()
    assert "status" in json_data
