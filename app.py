import os
from dotenv import load_dotenv
from webapp import create_app


load_dotenv()


app = create_app()


if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
