import os
from dotenv import load_dotenv
from webapp import create_app


load_dotenv()


app = create_app()


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 5000))
    debug_mode = os.getenv("DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug_mode)
