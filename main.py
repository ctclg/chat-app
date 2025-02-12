#main.py

from fastapi import FastAPI, Request, Form, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse
import openai
import os
from dotenv import load_dotenv
import logging
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, EmailStr
import json
from typing import List, Optional
from azure.cosmos import CosmosClient, PartitionKey
from passlib.context import CryptContext
import uuid
from datetime import datetime, timedelta
from jose import JWTError, jwt

class ChatSettings(BaseModel):
    system_prompt: str
    model: str
    temperature: float
    max_tokens: int

class UserRegistration(BaseModel):
    email: EmailStr
    password: str

# Token and user models
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Conversation models
class Message(BaseModel):
    role: str
    content: str
    timestamp: str
    model: Optional[str] = None

class Conversation(BaseModel):
    name: str
    folder: str
    messages: List[Message]
    
# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Cosmos DB setup
cosmos_client = CosmosClient.from_connection_string(os.getenv("COSMOS_CONNECTION_STRING"))
database = cosmos_client.get_database_client("chat_app")
usercontainer = database.get_container_client("users")
conversationcontainer = database.get_container_client("conversations")

# Default settings
DEFAULT_SETTINGS = {
    "system_prompt": "You are a helpful assistant.",
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "max_tokens": 1000
}

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("No SECRET_KEY set in environment variables")
ALGORITHM = os.getenv("ALGORITHM")
if not ALGORITHM:
    raise ValueError("No ALGORITHM set in environment variables")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))
if not ACCESS_TOKEN_EXPIRE_MINUTES:
    raise ValueError("No ACCESS_TOKEN_EXPIRE_MINUTES set in environment variables")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")

# Helper functions for authentication
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Get current user
async def get_current_user(token: str = Depends(oauth2_scheme)):
    logger.info("=== Token Validation ===")
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        logger.info("Attempting to decode token")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        logger.info(f"Token decoded successfully for email: {email}")
        
        if email is None:
            logger.error("No email in token payload")
            raise credentials_exception

        # Query user from database
        query = "SELECT * FROM c WHERE c.email = @email AND c.type = 'user'"
        parameters = [{"name": "@email", "value": email}]
        
        users = list(usercontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        if not users:
            logger.error("User not found in database")
            raise credentials_exception

        logger.info("User authenticated successfully")
        logger.info("=== Token Validation Complete ===")
        return users[0]

    except JWTError as e:
        logger.error(f"JWT Error: {str(e)}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise credentials_exception

# Home page
@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Chat endpoint
@app.post("/chat")
async def chat(message: str = Form(...), conversation: str = Form(default="[]")):
    try:
        logger.info(f"Received message: {message}")
        
        # Parse conversation JSON string to list
        try:
            conversation_list = json.loads(conversation)
        except json.JSONDecodeError:
            conversation_list = []
        
        # Prepare messages for API call
        messages = []
        #messages = [{"role": "system", "content": DEFAULT_SETTINGS["system_prompt"]}]
        messages.extend(conversation_list)
        messages.append({"role": "user", "content": message})
        #print(messages)
        response = client.chat.completions.create(
            model=DEFAULT_SETTINGS["model"],  # Now using the selected model
            messages=messages,
            temperature=DEFAULT_SETTINGS["temperature"],
            max_tokens=DEFAULT_SETTINGS["max_tokens"]
        )

        return JSONResponse(content={
            "response": response.choices[0].message.content
        })
    except Exception as e:
        logger.error(f"Error calling OpenAI API: {str(e)}")
        logger.exception("Full exception details:")
        return JSONResponse(content={"error": str(e)}, status_code=500)

# Update chat settings
@app.post("/update-settings")
async def update_settings(settings: ChatSettings):
    global DEFAULT_SETTINGS
    DEFAULT_SETTINGS = settings.dict()
    return JSONResponse(content={"message": "Settings updated successfully"})

# Register user
@app.post("/api/register")
async def register(user: UserRegistration):
    logger.info(f"Registration attempt for email: {user.email}")
    try:
        # Check if user already exists
        query = "SELECT * FROM c WHERE c.email = @email"
        parameters = [{"name": "@email", "value": user.email}]
        existing_users = list(usercontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        if existing_users:
            raise HTTPException(status_code=400, detail="Email already registered")

        # Validate password (add your password requirements)
        if len(user.password) < 8:
            raise HTTPException(
                status_code=400, 
                detail="Password must be at least 8 characters long"
            )

        # Create new user document
        user_id = str(uuid.uuid4())
        user_doc = {
            'id': user_id,
            'partitionKey': f'USER#{user_id}',
            'email': user.email,
            'password_hash': pwd_context.hash(user.password),
            'created_at': datetime.utcnow().isoformat(),
            'type': 'user',
            'is_active': True
        }

        usercontainer.create_item(body=user_doc)
        logger.info(f"Successfully registered user: {user.email}")
        return {"message": "Registration successful", "user_id": user_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {str(e)}")  # For debugging
        logger.error(f"Registration error for {user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred during registration. Please try again."
        )

# Test database connection
@app.get("/api/test-db")
async def test_db():
    try:
        # Try to query the database
        query = "SELECT VALUE COUNT(1) FROM c"
        result = list(usercontainer.query_items(
            query=query,
            enable_cross_partition_query=True
        ))
        return {"message": "Database connection successful", "count": result[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

# Login endpoint
@app.post("/api/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    logger.info("="*50)
    logger.info("LOGIN ATTEMPT")
    logger.info(f"Username provided: {form_data.username}")
    
    try:
        # Query user from database
        query = "SELECT * FROM c WHERE c.email = @email AND c.type = 'user'"
        parameters = [{"name": "@email", "value": form_data.username}]
        
        logger.info("Querying database for user")
        users = list(usercontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        logger.info(f"Found {len(users)} matching users")

        if not users:
            logger.error("No user found with provided email")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify password
        is_password_correct = pwd_context.verify(form_data.password, users[0]["password_hash"])
        logger.info(f"Password verification result: {is_password_correct}")

        if not is_password_correct:
            logger.error("Invalid password")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = users[0]
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["email"]}, 
            expires_delta=access_token_expires
        )
        
        logger.info(f"Login successful for user: {user['email']}")
        logger.info("="*50)
        
        return {"access_token": access_token, "token_type": "bearer"}
        
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        logger.info("="*50)
        raise

# Test protected endpoint
@app.get("/api/users/me")
async def read_users_me(current_user = Depends(get_current_user)):
    return {
        "email": current_user["email"],
        "id": current_user["id"]
    }

# Middleware to authenticate requests
@app.middleware("http")
async def authenticate_requests(request: Request, call_next):
    # Allow access to register, token endpoints, and static assets
    public_paths = [
        "/static/",
        "/api/register",
        "/api/token"
    ]

    if any(request.url.path.startswith(path) for path in public_paths):
        return await call_next(request)

    # Check for token in protected routes
    if request.url.path.startswith("/static/"):
        token = request.cookies.get("token")
        if not token:
            return RedirectResponse(url="/static/login.html")
        
        try:
            # Verify token
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            # If valid, continue with the request
            return await call_next(request)
        except JWTError:
            return RedirectResponse(url="/static/login.html")

    return await call_next(request)

# Save conversation
@app.post("/api/conversations")
async def save_conversation(
    conversation: Conversation,
    current_user = Depends(get_current_user)
):
    try:
        conversation_doc = {
            'id': str(uuid.uuid4()),
            'partitionKey': f'CHAT#{current_user["id"]}',
            'type': 'conversation',
            'user_id': current_user["id"],
            'name': conversation.name,
            'folder': conversation.folder,
            'messages': [msg.dict() for msg in conversation.messages],
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        result = conversationcontainer.create_item(body=conversation_doc)
        return result

    except Exception as e:
        logger.error(f"Error saving conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save conversation"
        )

# Update conversation
@app.put("/api/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    conversation: Conversation,
    current_user = Depends(get_current_user)
):
    partition_key = f'CHAT#{current_user["id"]}'        
    # Read existing conversation
    try:
        existing = conversationcontainer.read_item( 
            item=conversation_id,
            partition_key=partition_key
        )
    except Exception as e:
        logger.error(f"Error reading existing conversation: {str(e)}")
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if name or folder has changed
    if existing.get('name') != conversation.name or existing.get('folder') != conversation.folder:
        # Create as new conversation
        try:
            conversation_doc = {
                'id': str(uuid.uuid4()),
                'partitionKey': partition_key,
                'type': 'conversation',
                'user_id': current_user["id"],
                'name': conversation.name,
                'folder': conversation.folder,
                'messages': [msg.dict() for msg in conversation.messages],
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            result = conversationcontainer.create_item(body=conversation_doc)
            logger.info(f"Update successful.")
            return result
            
        except Exception as e:
            logger.error(f"Error during replace_item: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update conversation: {str(e)}"
            )
    else:
        # Replace the document
        try:
            conversation_doc = {
                'id': conversation_id,
                'partitionKey': partition_key,
                'type': 'conversation',
                'user_id': current_user["id"],
                'name': conversation.name,
                'folder': conversation.folder,
                'messages': [msg.dict() for msg in conversation.messages],
                'created_at': existing.get('created_at'),
                'updated_at': datetime.utcnow().isoformat()
            }
            result = conversationcontainer.replace_item( 
                item=conversation_id,
                body=conversation_doc
            )
            logger.info(f"Update successful.")
            return result
            
        except Exception as e:
            logger.error(f"Error during replace_item: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update conversation: {str(e)}"
            )

# Delete conversation
@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user = Depends(get_current_user)
):
    try:
        partition_key = f'CHAT#{current_user["id"]}'
        conversationcontainer.delete_item(
            item=conversation_id,
            partition_key=partition_key
        )
        return {"message": "Conversation deleted successfully"}

    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete conversation"
        )
 
# Get conversation
@app.get("/api/conversation/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user = Depends(get_current_user)
):
    try:
        #c.id, c.partitionKey, c.user_id, c.name, c.folder, c.created_at, c.updated_at, c.type,
        #c.messages, c._rid, c._self, c._etag, c._attachments, c._ts
        query = """
        SELECT c.messages
        FROM c
        WHERE c.type = 'conversation' 
        AND c.partitionKey = @partitionKey 
        AND c.id = @id
        ORDER BY c.created_at DESC
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'},
            {"name": "@id", "value": conversation_id}
        ]
        logger.info(f"SQL:" + query)
        logger.info(f"Parameters:" + str(parameters))

        conversation = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        logger.info(f"Conversation: {conversation}")

        return conversation

    except Exception as e:
        logger.error(f"Error retrieving conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve conversation"
        )

# Get conversations
@app.get("/api/conversations")
async def get_conversations(current_user = Depends(get_current_user)):
    try:
        query = """
        SELECT 
         c.id, c.partitionKey, c.user_id, c.name, c.folder, c.created_at, c.updated_at, c.type,
         c.id as messages, c._rid, c._self, c._etag, c._attachments, c._ts
        FROM c
        WHERE c.type = 'conversation' 
        AND c.partitionKey = @partitionKey 
        ORDER BY c.created_at DESC
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'}
        ]
        
        conversations = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        return conversations

    except Exception as e:
        logger.error(f"Error retrieving conversations: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve conversations"
        )

# Get folders
@app.get("/api/folders")
async def get_folders(current_user = Depends(get_current_user)):
    try:
        query = """
        SELECT DISTINCT VALUE c.folder 
        FROM c 
        WHERE c.type = 'conversation' 
        AND c.partitionKey = @partitionKey
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'}
        ]
        
        folders = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        return folders

    except Exception as e:
        logger.error(f"Error retrieving folders: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve folders"
        )

# Check if conversation exists
@app.post("/api/conversations/check")
async def check_conversation_exists(
    request: dict,
    current_user = Depends(get_current_user)
):
    try:
        query = """
        SELECT c.id
        FROM c
        WHERE c.type = 'conversation'
        AND c.partitionKey = @partitionKey
        AND c.name = @name
        AND c.folder = @folder
        """
        parameters = [
            {"name": "@partitionKey", "value": f'CHAT#{current_user["id"]}'},
            {"name": "@name", "value": request["name"]},
            {"name": "@folder", "value": request["folder"]}
        ]
        
        results = list(conversationcontainer.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if results:
            return {"exists": True, "id": results[0]['id']}
        return {"exists": False, "id": None}

    except Exception as e:
        logger.error(f"Error checking conversation existence: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to check conversation existence"
        )
'''
@app.put("/api/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    request: dict,
    current_user = Depends(get_current_user)
):
    try:
        # Check if conversation exists
        partition_key = f'CHAT#{current_user["id"]}'
        
        # Update conversation
        conversation = conversationcontainer.read_item(
            item=conversation_id,
            partition_key=partition_key
        )
        
        conversation['name'] = request['name']
        conversation['updated_at'] = datetime.utcnow().isoformat()
        
        result = conversationcontainer.replace_item(
            item=conversation_id,
            body=conversation
        )
        
        return result

    except Exception as e:
        logger.error(f"Error renaming conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to rename conversation"
        )
'''

# Debugging routes
@app.get("/api/debug/routes")
async def debug_routes():
    try:
        logger.info("="*50)
        logger.info("Debugging routes")
        
        routes_list = []
        for route in app.routes:
            logger.info(f"Found route: {route.path} - {route.methods}")
            routes_list.append({
                "path": str(route.path),
                "methods": list(route.methods) if route.methods else []
            })
        
        logger.info(f"Total routes found: {len(routes_list)}")
        logger.info("="*50)
        
        return {"routes": routes_list}
        
    except Exception as e:
        logger.error(f"Error in debug_routes: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing routes: {str(e)}"
        )

# Debug test endpoint
@app.get("/api/debug/test")
async def debug_test():
    logger.info("="*50)
    logger.info("Debug test endpoint hit")
    logger.info("="*50)
    return {"status": "ok", "message": "Debug endpoint working"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)