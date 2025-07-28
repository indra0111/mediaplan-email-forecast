#!/bin/bash

# Initialize Conda for non-interactive shell
eval "$(conda shell.bash hook)"

# Activate the environment
conda activate gemini_mediaplan

# Run the app
uvicorn main:app --reload

# nohup bash start_automated_mediaplan_forecast.sh > /dev/null 2>&1 &
