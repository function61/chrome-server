FROM node

# other than zip are merely dependencies for local Chrome to run in development mode
# (not needed for building the Lambda function)
RUN apt update && apt install -y zip libx11-xcb1 libxtst6 libnss3 libxss1 libasound2 libatk1.0-0 libgtk-3-0
