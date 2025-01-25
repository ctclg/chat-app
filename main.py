from fastapi import FastAPI, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv(verbose=True)

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Initialize OpenAI client - will use environment variable from Azure if .env is not present
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(message: str = Form(...)):
    try:
        # Check if API key is available
        if not os.getenv("OPENAI_API_KEY"):
            return JSONResponse(
                content={"error": "OpenAI API key not found in environment variables"},
                status_code=500
            )

        # Make the API call
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": message}
            ]
        )
        
        # Return the response
        return JSONResponse(content={
            "response": response.choices[0].message.content
        })
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")  # Server-side logging
        return JSONResponse(
            content={"error": f"An error occurred: {str(e)}"},
            status_code=500
        )
    
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)