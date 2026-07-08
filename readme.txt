# Create a resource group if you don't have one
az group create --name rgtluchatbot --location westus2

# Create an App Service plan
az appservice plan create --name chatbotplan --resource-group rgtluchatbot --sku B1 --is-linux

# Create the web app
az webapp create --resource-group rgtluchatbot --plan chatbotplan --name tluchatbot --runtime "PYTHON|3.11"

az ad sp create-for-rbac --name "chat-app" --role contributor --scopes /subscriptions/xxxxxxxxxxx/resourceGroups/rgtluchatbot --sdk-auth

# Set your OpenAI API key
az webapp config appsettings set --resource-group rgtluchatbot --name tluchatbot --settings OPENAI_API_KEY="sk-proj-xxxxxxxxxx"


#Run locally with: 
uvicorn main:app --reload

#Github link: https://github.com/ctclg/chat-app
#Azure resource group: rgtluchatbot
#Azure webapp link: http://tluchatbot.azurewebsites.net

#Check Github status:
git status

#Commit and push code to Github:
git add .
git commit -m "Settings panel added"
git push origin main

#Deployment to Azure is done automatially!
