//main.js

// Global variables
let conversationHistory = [];
let currentConversationId = null;

window.onload = function () {
    document.getElementById('message-input').focus();
    document.addEventListener('DOMContentLoaded', updateUIForAuthState);
    if (conversationHistory.length === 0) {
        const messagesContainer = document.getElementById('chat-messages');
    }
};

function updateUIForAuthState() {
    const loadConversationsBtn = document.getElementById('load-conversations');
    const saveConversationBtn = document.getElementById('save-conversation');
    const loginBtn = document.getElementById('login');
    const logoutBtn = document.getElementById('logout');
    
    if (isUserLoggedIn()) {
        loadConversationsBtn.style.display = 'block';
        saveConversationBtn.style.display = 'block';
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
    } else {
        loadConversationsBtn.style.display = 'none';
        saveConversationBtn.style.display = 'none';
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
}

// Helper function to check if user is logged in
function isUserLoggedIn() {
    return !!localStorage.getItem('token');
}

// Load conversation and settings from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    // Restore conversation ID from localStorage
    currentConversationId = localStorage.getItem('currentConversationId');
    console.log('Restored currentConversationId:', currentConversationId);
    const savedConversation = localStorage.getItem('chatHistory');
    if (savedConversation) {
        try {
            conversationHistory = JSON.parse(savedConversation);
            // Restore chat messages
            conversationHistory.forEach(msg => {
                addMessage(
                    msg.content,
                    msg.role === 'user' ? 'user-message' :
                    msg.role === 'assistant' ? 'bot-message' :
                    msg.role === 'system' ? 'system-message' : null,
                    msg.timestamp,
                    msg.role === 'assistant' ? msg.model : null
                );
            });
        } catch (e) {
            console.error('Error loading chat history:', e);
            conversationHistory = [];
        }
    } else {
    }
    loadSettings();
    updateUIForAuthState();
});

//Submit message on Enter key (but not with Shift key)
document.getElementById('message-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent default to avoid newline
        const form = document.getElementById('chat-form');
        form.requestSubmit(); // This is more reliable than dispatchEvent
        document.getElementById('message-input').focus();
    }
});

async function saveConversation(name, folder) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Please login to save conversations');
            return;
        }

        console.log('Token exists:', !!token); // Debug log

        // Check if this is an update of an existing conversation
        if (currentConversationId) {
            console.log('Updating existing conversation:', currentConversationId);
            const updateData = {
                name: name,
                folder: folder,
                messages: conversationHistory
            };
            console.log('Full update payload:', JSON.stringify(updateData, null, 2));
        
            const response = await fetch(`/api/conversations/${currentConversationId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,  // Make sure Bearer prefix is included
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    folder: folder,
                    messages: conversationHistory
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Update error:', errorData);
                throw new Error(errorData.detail || 'Failed to update conversation');
            }

            const result = await response.json();
            console.log('Update successful:', result);
            console.log('Number of messages in response:', result.messages.length);
        
        } else {
            console.log('Creating new conversation');
            const response = await fetch('/api/conversations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,  // Make sure Bearer prefix is included
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    folder: folder,
                    messages: conversationHistory
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Create error:', errorData);
                throw new Error(errorData.detail || 'Failed to create conversation');
            }

            const result = await response.json();
            currentConversationId = result.id;
            localStorage.setItem('currentConversationId', currentConversationId);

            console.log('Creation successful:', result);
            console.log('Number of messages in response:', result.messages.length);
        }

        // Update localStorage
        localStorage.setItem('currentFolder', folder);
        localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
        
        //alert('Conversation saved successfully!');

    } catch (error) {
        console.error('Error saving conversation:', error);
        if (error.message.includes('401')) {
            // Handle expired token
            localStorage.removeItem('token');
            localStorage.removeItem('currentConversationId');
            localStorage.removeItem('currentFolder');
            alert('Your session has expired. Please login again.');
            window.location.href = '/static/login.html';
        } else {
            alert(error.message || 'Error saving conversation');
        }
    }
}

async function validateToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        return false;
    }

    try {
        const response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('currentConversationId');
                localStorage.removeItem('token');
                localStorage.removeItem('currentFolder');
                return false;
            }
            throw new Error('Failed to validate token');
        }

        return true;
    } catch (error) {
        console.error('Token validation error:', error);
        return false;
    }
}

async function getConversations() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        console.log('Token found:', token); // Debug log

        const response = await fetch('/api/conversations', {
            headers: {
                'Authorization': `Bearer ${token}`,  // Make sure 'Bearer ' prefix is included
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status); // Debug log

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error response:', errorData); // Debug log
            throw new Error(errorData.detail || 'Failed to fetch conversations');
        }

        const data = await response.json();
        console.log('Conversations retrieved:', data); // Debug log
        return data;
    } catch (error) {
        console.error('Error fetching conversations:', error);
        throw error;
    }
}

document.getElementById('save-conversation').addEventListener('click', () => {
    showSaveDialog();
});

async function showSaveDialog() {
    // Get existing folders
    const folders = await getFolders();

    // Get current folder if a conversation was loaded
    const currentFolder = localStorage.getItem('currentFolder') || '';

    const dialog = document.createElement('div');
    dialog.className = 'conversation-selector';
    dialog.innerHTML = `
        <div class="conversation-selector-content">
            <h3>Save Conversation</h3>
            <div class="form-group">
                <label for="conversation-name">Conversation Name:</label>
                <input type="text" id="conversation-name" 
                    placeholder="Enter a name for this conversation"
                    value="${getDefaultConversationName()}"
                >
            </div>
            <div class="form-group">
                <label for="folder-select">Folder:</label>
                <div class="folder-select-container">
                    <select id="folder-select">
                        <option value="">-- Select Folder --</option>
                        ${folders.map(folder =>
        `<option value="${escapeHTML(folder)}" 
                                ${folder === currentFolder ? 'selected' : ''}>
                                ${escapeHTML(folder)}
                            </option>`
    ).join('')}
                    </select>
                    <button class="new-folder-button" type="button" onclick="showNewFolderInput()">
                        New&nbsp;Folder
                    </button>
                </div>
            </div>
            <div id="new-folder-input" class="form-group" style="display: none;">
                <label for="new-folder">New Folder Name:</label>
                <input type="text" id="new-folder" placeholder="Enter new folder name">
            </div>
            <div class="dialog-buttons">
                <button class="save-button">Save</button>
                <button class="cancel-button">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // Add event listeners
    dialog.querySelector('.cancel-button').onclick = () => dialog.remove();
    dialog.querySelector('.save-button').onclick = async () => {
        const name = document.getElementById('conversation-name').value.trim();
        const folderSelect = document.getElementById('folder-select');
        const newFolderInput = document.getElementById('new-folder');
        const folder = newFolderInput.style.display !== 'none' && newFolderInput.value.trim()
            ? newFolderInput.value.trim()
            : folderSelect.value;

        if (!name) {
            alert('Please enter a name for the conversation');
            return;
        }
        if (!folder) {
            alert('Please select or create a folder');
            return;
        }

        // Check if conversation with same name exists in the folder
        const exists = await checkConversationExists(name, folder);
        if (exists) {
            if (confirm(`A conversation named "${name}" already exists in folder "${folder}". Do you want to overwrite it?`)) {
                await saveConversation(name, folder);
                dialog.remove();
            }
        } else {
            await saveConversation(name, folder);
            dialog.remove();
        }
    };

    // Focus the input field
    document.getElementById('conversation-name').focus();
}

function showNewFolderInput() {
    const folderSelect = document.getElementById('folder-select');
    const newFolderInput = document.getElementById('new-folder-input');

    if (newFolderInput.style.display === 'none') {
        newFolderInput.style.display = 'block';
        folderSelect.disabled = true;
    } else {
        newFolderInput.style.display = 'none';
        folderSelect.disabled = false;
    }
}

async function getFolders() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return [];

        const response = await fetch('/api/folders', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch folders');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching folders:', error);
        return [];
    }
}

async function checkConversationExists(name, folder) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/conversations/check', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, folder })
        });

        if (!response.ok) {
            throw new Error('Failed to check conversation');
        }

        const result = await response.json();
        return result.exists;
    } catch (error) {
        console.error('Error checking conversation:', error);
        return false;
    }
}

function getDefaultConversationName() {
    // Get the first non-system message content
    const firstMessage = conversationHistory.find(msg => msg.role !== 'system');
    if (firstMessage) {
        // Use the first 30 characters of the message as default name
        return firstMessage.content.substring(0, 30) + (firstMessage.content.length > 30 ? '...' : '');
    }
    return `Conversation ${new Date().toLocaleString()}`;
}

document.getElementById('load-conversations').addEventListener('click', async () => {
    try {
        // Only get conversations from Cosmos DB
        const conversations = await getConversations();
        showConversationSelector(conversations);
    } catch (error) {
        console.error('Failed to load conversations:', error);
        alert('Failed to load conversations');
    }
});

async function showConversationSelector(conversations) {
    // Don't use localStorage data here, only use conversations from Cosmos DB
    const conversationsByFolder = conversations.reduce((acc, conv) => {
        if (!acc[conv.folder]) {
            acc[conv.folder] = [];
        }
        acc[conv.folder].push(conv);
        return acc;
    }, {});

    const dialog = document.createElement('div');
    dialog.className = 'conversation-selector';
    dialog.innerHTML = `
        <div class="conversation-selector-content">
            <h3>Select a Conversation</h3>
            <div class="folder-select-container">
                <select id="folder-filter">
                    <option value="">All Folders</option>
                    ${Object.keys(conversationsByFolder).map(folder => `
                        <option value="${escapeHTML(folder)}">${escapeHTML(folder)}</option>
                    `).join('')}
                </select>
            </div>
            <div class="conversation-list">
                ${Object.entries(conversationsByFolder).map(([folder, convs]) => `
                    <div class="folder-section" data-folder="${escapeHTML(folder)}">
                        <div class="folder-header">${escapeHTML(folder)}</div>
                        ${convs.map((conv) => `
                            <div class="conversation-item" data-conversation='${JSON.stringify(conv)}'>
                                <div class="conversation-content">
                                    <div class="conversation-name" data-id="${conv.id}">
                                        <span class="name-text">${escapeHTML(conv.name)}</span>
                                        <input type="text" class="name-edit" value="${escapeHTML(conv.name)}" style="display: none;">
                                    </div>
                                    <div class="conversation-date">
                                        ${new Date(conv.created_at).toLocaleString()}
                                    </div>
                                </div>
                                <div class="conversation-actions">
                                    <button class="rename-btn" title="Rename">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="delete-btn" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
            <button class="close-selector">Cancel</button>
        </div>
    `;

    document.body.appendChild(dialog);

    // Add event listeners
    dialog.querySelector('.close-selector').onclick = () => dialog.remove();

    // Folder filter functionality
    const folderFilter = dialog.querySelector('#folder-filter');
    folderFilter.addEventListener('change', (e) => {
        const selectedFolder = e.target.value;
        const folderSections = dialog.querySelectorAll('.folder-section');
        folderSections.forEach(section => {
            if (!selectedFolder || section.dataset.folder === selectedFolder) {
                section.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        });
    });

    // Conversation selection
    dialog.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Only load conversation if not clicking buttons or input
            if (!e.target.closest('.conversation-actions') &&
                !e.target.closest('.name-edit')) {
                const conversation = JSON.parse(item.dataset.conversation);
                console.log('Selected conversation:', conversation); // Debug log
                loadConversation(conversation);
                dialog.remove();
            }
        });
    });

    // Rename functionality
    dialog.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.conversation-item');
            const nameContainer = item.querySelector('.conversation-name');
            const nameText = nameContainer.querySelector('.name-text');
            const nameInput = nameContainer.querySelector('.name-edit');

            nameText.style.display = 'none';
            nameInput.style.display = 'block';
            nameInput.focus();
            nameInput.select();

            // Handle rename
            nameInput.addEventListener('blur', async () => {
                const newName = nameInput.value.trim();
                if (newName && newName !== nameText.textContent) {
                    const conversation = JSON.parse(item.dataset.conversation);
                    await renameConversation(conversation.id, newName, conversation.folder);
                    nameText.textContent = newName;
                }
                nameText.style.display = 'block';
                nameInput.style.display = 'none';
            });

            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    nameInput.blur();
                }
            });
        });
    });

    // Delete functionality
    dialog.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.conversation-item');
            const conversation = JSON.parse(item.dataset.conversation);

            if (confirm(`Are you sure you want to delete "${conversation.name}"?`)) {
                await deleteConversation(conversation.id, conversation.folder);
                item.remove();

                // Remove folder section if empty
                const folderSection = item.closest('.folder-section');
                if (!folderSection.querySelector('.conversation-item')) {
                    folderSection.remove();

                    // Update folder filter options
                    const option = folderFilter.querySelector(`option[value="${conversation.folder}"]`);
                    if (option) option.remove();
                }
            }
        });
    });
}

// Define a function to be executed after a wait time
function myFunction() {
    console.log('Wait time is over!');
}

async function loadConversation(conversation) {
    try {
        console.log('Loading conversation with ID:', conversation.id); // Debug log
        
        // Clear current chat
        document.getElementById('chat-messages').innerHTML = '';
        conversationHistory = [];

        // Store the current folder and conversation ID
        localStorage.setItem('currentFolder', conversation.folder);
        currentConversationId = conversation.id;  // Set the ID
        console.log('Set currentConversationId to:', currentConversationId); // Debug log
        
        // Load the selected conversation
        const tmpconversationHistory = await getConversationMessages(conversation.id);
        console.log('Loaded conversation:', tmpconversationHistory); // Debug log

        // Convert to the desired format
        conversationHistory = tmpconversationHistory[0].messages.map(function(message) {
            return {
                role: message.role,
                content: message.content,
                timestamp: message.timestamp,
                model: message.model
            };
        });
        
        console.log("conversationHistory: " + JSON.stringify(conversationHistory));
        
        // Set a wait time of 2 seconds (2000 milliseconds)
        setTimeout(myFunction, 4000);

        // Display all messages
        conversationHistory.forEach(msg => {
            addMessage(
                msg.content,
                msg.role === 'user' ? 'user-message' : 
                msg.role === 'assistant' ? 'bot-message' :
                msg.role === 'system' ? 'system-message' : null,
                msg.timestamp,
                msg.role === 'assistant' ? msg.model : null
            );
        });

        // Save to localStorage with the ID
        localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
        localStorage.setItem('currentConversationId', currentConversationId); // Save ID to localStorage

    } catch (error) {
        console.error('Error loading conversation:', error);
        alert('Error loading conversation');
    }
}

async function getConversationMessages(conversationId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        console.log('Token found:', token); // Debug log
        const response = await fetch(`/api/conversation/${conversationId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,  // Make sure 'Bearer ' prefix is included
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status); // Debug log

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error response:', errorData); // Debug log
            throw new Error(errorData.detail || 'Failed to fetch conversations');
        }

        const data = await response.json();
        console.log('The Conversation retrieved:', data); // Debug log
        return data;
    } catch (error) {
        console.error('Error fetching conversation:', error);
        throw error;
    }
}

async function renameConversation(id, newName, folder) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch(`/api/conversations/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: newName,
                folder: folder
            })
        });

        if (!response.ok) {
            throw new Error('Failed to rename conversation');
        }

        return await response.json();
    } catch (error) {
        console.error('Error renaming conversation:', error);
        alert('Failed to rename conversation');
        throw error;
    }
}

async function deleteConversation(id, folder) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch(`/api/conversations/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete conversation');
        }

        return await response.json();
    } catch (error) {
        console.error('Error deleting conversation:', error);
        alert('Failed to delete conversation');
        throw error;
    }
}

// Chat form submission
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();

    if (!message) return;

    // Todo: Do not send system message if the model does not support it
    // const selectedModel = document.getElementById('model-select').value;
    // Add system message to chat and conversation history if it is empty
    if (conversationHistory.length === 0) {
        //Generate currentConversationId and save it to localStorage
        //const uuid = generateUUID();
        //currentConversationId = uuid;
        //localStorage.setItem('currentConversationId', currentConversationId); // Save ID to localStorage

        addMessage(document.getElementById('system-prompt').value, 'system-message', formatDate(new Date()));
        conversationHistory.push({
            role: 'system',
            content: document.getElementById('system-prompt').value,
            timestamp: formatDate(new Date())
        });
    }

    // Add user message to chat and onversation history
    addMessage(escapeHTML(message), 'user-message', formatDate(new Date()));
    messageInput.value = '';
    conversationHistory.push({
        role: 'user',
        content: escapeHTML(message),
        timestamp: formatDate(new Date())
    });

    // Save to localStorage immediately after adding user message
    localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));

    showTypingIndicator();

    try {
        const formData = new FormData();
        formData.append('message', message);
        formData.append('conversation', JSON.stringify(conversationHistory));

        const response = await fetch('/chat', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        hideTypingIndicator();

        if (response.ok) {

            // Add bot message to chat
            const selectedModel = document.getElementById('model-select').value;
            addMessage(data.response, 'bot-message', formatDate(new Date()), selectedModel);
            //addMessage(data.response, 'bot-message');
            // Add bot message to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: data.response,
                timestamp: formatDate(new Date()),
                model: selectedModel
            });

            //Reset char count
            document.getElementById('char-count').textContent = `0 characters`;

            // Save updated conversation to localStorage
            localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
            document.getElementById('message-input').focus();
        } else {
            console.error('Server error:', data);
            addMessage(`Error: ${data.error || 'Unknown error occurred'}`, 'bot-message error');
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('Network error:', error);
        addMessage('Error: Could not connect to the server.', 'bot-message error');
    }
});

document.getElementById('message-input').addEventListener('input', function () {
    const charCount = this.value.length;
    document.getElementById('char-count').textContent = `${charCount} characters`;
});

function addMessage(message, className, timestamp, model = null) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', className);

    // Create message content with Markdown support
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    if (typeof marked !== 'undefined') {
        contentDiv.innerHTML = marked.parse(message);
    } else {
        contentDiv.textContent = message;
    }

    // Add model info for bot messages
    if (className === 'bot-message' && model) {
        const modelInfo = document.createElement('div');
        modelInfo.classList.add('model-info');
        modelInfo.textContent = `Model: ${model}`;
    }

    // Add timestamp
    const msgtimestamp = document.createElement('div');
    msgtimestamp.classList.add('message-timestamp');
    if (className != 'system-message') {
        msgtimestamp.textContent = timestamp
    }

    // Add header line
    if (className === 'bot-message') {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('bot-message-line');
        lineDiv.textContent = model + ':';
        messageElement.appendChild(lineDiv);
    } else if (className === 'user-message') {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('user-message-line');
        lineDiv.textContent = "User:";
        messageElement.appendChild(lineDiv);
    } else {
        const lineDiv = document.createElement('div');
        lineDiv.classList.add('system-message-line');
        lineDiv.textContent = "System message:";
        messageElement.appendChild(lineDiv);
    }

    // Add action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');

    // Copy button
    const copyButton = document.createElement('button');
    if (className === 'user-message') {
        copyButton.classList.add('action-button-user');
    } else {
        copyButton.classList.add('action-button');
    }
    copyButton.innerHTML = '📋 Copy';
    copyButton.onclick = () => {
        // get the div that contains the button
        const buttonContainer = copyButton.parentElement;
        // get the second previous sibling (should be the div you want to copy from)
        const textContainer = buttonContainer.previousElementSibling.previousElementSibling;
        // get the text from the div you want to copy from
        const messagetocopy = textContainer.innerText;
        navigator.clipboard.writeText(messagetocopy)
            .then(() => {
                copyButton.innerHTML = '✓ Copied!';
                setTimeout(() => copyButton.innerHTML = '📋 Copy', 2000);
            });
    };

    // Feedback buttons (for bot messages only)
    // if (className === 'bot-message') {
    //     const likeButton = document.createElement('button');
    //     likeButton.classList.add('action-button');
    //     likeButton.innerHTML = '👍';
    //     likeButton.onclick = () => handleFeedback(message, 'positive');

    //     const dislikeButton = document.createElement('button');
    //     dislikeButton.classList.add('action-button');
    //     dislikeButton.innerHTML = '👎';
    //     dislikeButton.onclick = () => handleFeedback(message, 'negative');
    //     actionsDiv.appendChild(likeButton);
    //     actionsDiv.appendChild(dislikeButton);
    // }
    actionsDiv.appendChild(copyButton);
    messageElement.appendChild(contentDiv);
    messageElement.appendChild(msgtimestamp);
    messageElement.appendChild(actionsDiv);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add typing indicator functions
function showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'flex';//flex
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'block';//none
    }
}

// Clear chat
document.getElementById('clear-chat').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the conversation?')) {
        document.getElementById('chat-messages').innerHTML = '';
        conversationHistory = [];
        currentConversationId = null;
        localStorage.removeItem('chatHistory');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('currentFolder');
        document.getElementById('message-input').focus();
    }
});

// Settings handling
function saveSettings() {
    const settings = {
        model: document.getElementById('model-select').value,
        system_prompt: document.getElementById('system-prompt').value,
        temperature: document.getElementById('temperature').value,
        max_tokens: document.getElementById('max-tokens').value
    };
    localStorage.setItem('chatSettings', JSON.stringify(settings));
}

function loadSettings() {
    const settings = localStorage.getItem('chatSettings');
    if (settings) {
        try {
            const parsedSettings = JSON.parse(settings);
            document.getElementById('model-select').value = parsedSettings.model || DEFAULT_SETTINGS.model;
            document.getElementById('system-prompt').value = parsedSettings.system_prompt || DEFAULT_SETTINGS.system_prompt;
            document.getElementById('temperature').value = parsedSettings.temperature || DEFAULT_SETTINGS.temperature;
            document.getElementById('max-tokens').value = parsedSettings.max_tokens || DEFAULT_SETTINGS.max_tokens;
        } catch (e) {
            console.error('Error loading settings:', e);
            restoreDefaultSettings();
        }
    } else {
        restoreDefaultSettings();
    }
}

// Register button click event
//document.getElementById('register-button').addEventListener('click', function () {
//    document.getElementById('registration-form').style.display = 'block';
//    document.getElementById('username').focus();
//});

document.getElementById('registrationForm').addEventListener('submit', function (event) {
    event.preventDefault();

    const formData = new FormData(this);

    fetch('/register', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            alert('User registered successfully!');
            console.log(data);
            // You can redirect to another page or perform additional actions here
        })
        .catch(error => {
            alert('An error occurred during registration. Please try again.');
            console.error(error);
        });
});

// Email validation function
function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
}

// Settings form submission
document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
        model: document.getElementById('model-select').value,
        system_prompt: document.getElementById('system-prompt').value,
        temperature: parseFloat(document.getElementById('temperature').value),
        max_tokens: parseInt(document.getElementById('max-tokens').value)
    };

    try {
        const response = await fetch('/update-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            saveSettings();
            //alert('Settings updated successfully!');
        } else {
            alert('Failed to update settings');
        }
        modal.style.display = "none";
        document.getElementById('message-input').focus();
    } catch (error) {
        console.error('Error updating settings:', error);
        alert('Error updating settings');
    }
});

function getModelCost(model) {
    const costs = {
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
        'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 }
    };
    return costs[model] || costs['gpt-3.5-turbo'];
}

// Add this to your model select change event
document.getElementById('model-select').addEventListener('change', function () {
    const model = this.value;
    const costs = getModelCost(model);
    const costInfo = `Input: $${costs.input}/1K tokens, Output: $${costs.output}/1K tokens`;
    document.getElementById('cost-info').textContent = costInfo;
});

// Default settings object
const DEFAULT_SETTINGS = {
    model: 'gpt-3.5-turbo',
    system_prompt: 'You are a helpful assistant.',
    temperature: 0.7,
    max_tokens: 1000
};

// Function to restore default settings
function restoreDefaultSettings() {
    document.getElementById('model-select').value = DEFAULT_SETTINGS.model;
    document.getElementById('system-prompt').value = DEFAULT_SETTINGS.system_prompt;
    document.getElementById('temperature').value = DEFAULT_SETTINGS.temperature;
    document.getElementById('max-tokens').value = DEFAULT_SETTINGS.max_tokens;
}

// Add event listener for restore defaults button
document.getElementById('restore-defaults').addEventListener('click', async () => {
    if (confirm('Are you sure you want to restore default settings?')) {
        restoreDefaultSettings();

        // Update server-side settings
        try {
            const response = await fetch('/update-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(DEFAULT_SETTINGS)
            });

            if (response.ok) {
                // Clear localStorage settings
                localStorage.removeItem('chatSettings');
                modal.style.display = "none";
                //alert('Settings restored to defaults successfully!');
            } else {
                alert('Failed to restore default settings');
            }
            document.getElementById('message-input').focus();
        } catch (error) {
            console.error('Error restoring default settings:', error);
            alert('Error restoring default settings');
        }
    }
});

// Feedback handling function
async function handleFeedback(message, type) {
    try {
        await fetch('/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                feedback: type
            })
        });
        // Show feedback confirmation
        const feedbackMsg = type === 'positive' ? 'Thanks for the positive feedback!' : 'Thanks for the feedback. We\'ll work on improving.';
        const notification = document.createElement('div');
        notification.className = 'feedback-notification';
        notification.textContent = feedbackMsg;
        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    } catch (error) {
        console.error('Error sending feedback:', error);
        alert('Failed to send feedback');
    }
}

// Add these CSS styles for the feedback notification
const style = document.createElement('style');
style.textContent = `
    .feedback-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #28a745;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 2.7s;
        z-index: 1000;
    }

    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

// Get the modal
var modal = document.getElementById("settings-modal");
// Get the button that opens the modal
var btn = document.getElementById("toggle-settings");
// Get the <span> element that closes the modal
var span = document.getElementsByClassName("close")[0];
// When the user clicks the button, open the modal 
btn.onclick = function () {
    modal.style.display = "block";
    loadSettings(); // Update form fields with saved settings
}
// When the user clicks on <span> (x), close the modal
span.onclick = function () {
    modal.style.display = "none";
    document.getElementById('message-input').focus();
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        modal.style.display = "none";
        document.getElementById('message-input').focus();
    }
})

// Get the Registration form
var regform = document.getElementById("registration-form");
// Get the <span> element that closes the modal
var spanregform = document.getElementsByClassName("close-regform")[0];
// When the user clicks on <span> (x), close the modal
spanregform.onclick = function () {
    regform.style.display = "none";
    document.getElementById('message-input').focus();
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        regform.style.display = "none";
        document.getElementById('message-input').focus();
    }
})

function escapeHTML(html) {
    const text = document.createTextNode(html);
    const div = document.createElement('div');
    div.appendChild(text);
    return div.innerHTML;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function login() {
    // Redirect to login page
    window.location.href = '/static/html/login.html';
    document.addEventListener('DOMContentLoaded', updateUIForAuthState);
}

function register() {
    // Redirect to register page
    window.location.href = '/static/html/register.html';
}

function logout() {
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user_email');
    localStorage.removeItem('currentConversationId');
    localStorage.removeItem('currentFolder');
    document.addEventListener('DOMContentLoaded', updateUIForAuthState);

    // Clear cookie
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    // Redirect to home page
    window.location.href = '/';
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0; // Generate random number
        const v = c === 'x' ? r : (r & 0x3 | 0x8); // Adjust according to UUID version 4
        return v.toString(16); // Convert to hexadecimal
    });
}
