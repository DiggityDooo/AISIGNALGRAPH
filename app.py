import os
from dotenv import load_dotenv
from webapp import create_app


load_dotenv()


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting server on port {port}")
    app.run(host="0.0.0.0", port=port)
