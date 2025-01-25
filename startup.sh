#!/bin/bash
cd /home/site/wwwroot

# Create and activate virtual environment
python -m venv antenv
source antenv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the application
gunicorn main:app --bind=0.0.0.0:8000 --timeout=120 --access-logfile=- --error-logfile=- --log-level=debug --workers=4 --worker-class=uvicorn.workers.UvicornWorker