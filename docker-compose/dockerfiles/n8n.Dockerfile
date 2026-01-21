FROM n8nio/n8n:2.5.0

USER root

# 1. Create the custom nodes directory
# n8n looks in /home/node/.n8n/nodes or /home/node/.n8n/custom
RUN mkdir -p /home/node/.n8n/nodes

# 2. Set the working directory to that folder
WORKDIR /home/node/.n8n/nodes

# 3. Install your specific community node
RUN npm install n8n-nodes-globals

# 4. Ensure the 'node' user owns these files
RUN chown -R node:node /home/node/.n8n

# 5. Switch back to the default user
USER node

# 6. Set the working directory back to default
WORKDIR /home/node

ENV N8N_COMMUNITY_PACKAGES_ENABLED=true
# ENV NODE_FUNCTION_ALLOW_EXTERNAL=n8n-nodes-globals
