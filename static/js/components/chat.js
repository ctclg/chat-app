// components/chat.js
import { formatDate, escapeHTML, showLoadingOverlay, removeLoadingOverlay } from '../utils/helpers.js';
import { LOCAL_STORAGE_KEYS } from '../utils/constants.js';

export class Chat {
    constructor(app) {
        this.history = [];
        this.currentId = null;
        this.messageInput = document.getElementById('message-input');
        this.chatMessages = document.getElementById('chat-messages');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.charCount = document.getElementById('char-count');
        this.app = app; 
        this.init();
    }

    async init() {
        this.loadHistory();
        this.setupEventListeners();
        await this.handleInitialLoad();

        marked.setOptions({
            highlight: function(code, lang) {
                if (Prism.languages[lang]) {
                    return Prism.highlight(code, Prism.languages[lang], lang);
                }
                return code;
            },
            breaks: true,
            gfm: true
        });        
    }

    async handleInitialLoad() {
        let loadingOverlay = null;
        let loadingTimeout = null;

        try {
            loadingTimeout = setTimeout(() => {
                loadingOverlay = showLoadingOverlay(this.chatMessages, 'Loading...');
            }, 1000);

            const currentConversation = localStorage.getItem('currentConversation');
            if (!currentConversation) {
                localStorage.setItem('currentConversation', "New");
                document.getElementById('current-chat').innerHTML = "Conversation: New";
            } else {
                const touched = localStorage.getItem('currentConversationTouched');
                document.getElementById('current-chat').innerHTML = 
                    `Conversation: ${currentConversation}${touched === "true" ? " *" : ""}`;
            }

            this.messageInput.focus();
        } catch (error) {
            console.error('Error during initialization:', error);
        } finally {
            clearTimeout(loadingTimeout);
            if (loadingOverlay) {
                removeLoadingOverlay(loadingOverlay);
            }
        }
    }

    setupEventListeners() {
        // Message input handlers
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSubmit();
            }
            this.messageInput.focus();
        });

        // Add this code for form submission when clicking Send
        document.getElementById('chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
            this.messageInput.focus();
        });

        this.messageInput.addEventListener('input', () => {
            this.updateCharCount();
        });

        // Clear chat handler
        document.getElementById('clear-chat').addEventListener('click', 
            () => this.clearChat());
            this.messageInput.focus();
    }

    updateCharCount() {
        const charCount = this.messageInput.value.length;
        this.charCount.textContent = `${charCount} characters`;
    }

    async handleSubmit() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        const settings = JSON.parse(localStorage.getItem('chatSettings'));
        const systemPromptSupported = settings.system_prompt_supported;
        const systemPrompt = systemPromptSupported === "Yes" ? 
            settings.system_prompt : 
            "System message not supported for the selected model.";

        // Add system message if history is empty
        if (this.history.length === 0) {
            this.addSystemMessage(systemPrompt);
        }

        // Add user message
        this.addUserMessage(message);
        this.messageInput.value = '';
        this.updateCharCount();

        // Show typing indicator
        this.showTypingIndicator();

        try {
            const response = await this.sendMessage(message);
            this.hideTypingIndicator();

            if (response.ok) {
                const data = await response.json();
                this.addBotMessage(data.response, settings.model);
                this.markConversationAsTouched();
            } else {
                const errorData = await response.text();
                console.error('Server error:', errorData);
                throw new Error(errorData);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.hideTypingIndicator();
            this.addErrorMessage('Failed to get response from server: ' + error.message);
        }
    }

    async sendMessage(message) {
        const formData = new FormData();
        formData.append('message', message);
        formData.append('conversation', JSON.stringify(this.history));

        return fetch('/chat', {
            method: 'POST',
            body: formData
        });
    }

    addSystemMessage(message) {
        this.addMessage({
            content: message,
            role: 'system',
            timestamp: formatDate(new Date())
        });
    }

    addUserMessage(message) {
        this.addMessage({
            content: message, 
            role: 'user',
            timestamp: formatDate(new Date())
        });
        this.scrollToBottom();
    }

    addBotMessage(message, model) {
        this.addMessage({
            content: message,
            role: 'assistant',
            timestamp: formatDate(new Date()),
            model: model
        });
        this.addCopyButtonToCodeBlocks();
        this.scrollToBottom();
    }

    addErrorMessage(message) {
        this.addMessage({
            content: message,
            role: 'error',
            timestamp: formatDate(new Date())
        });
    }

    addMessage(message) {
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
    
        // Add appropriate class based on role
        switch (message.role) {
            case 'user':
                messageElement.classList.add('user-message');
                break;
            case 'assistant':
                messageElement.classList.add('assistant-message');
                break;
            case 'system':
                messageElement.classList.add('system-message');
                break;
            case 'error':
                messageElement.classList.add('error-message');
                break;
        }
    
        // Add header line
        const lineDiv = document.createElement('div');
        lineDiv.classList.add(`${message.role}-message-line`);
        lineDiv.textContent = this.getMessageHeader(message);
        messageElement.appendChild(lineDiv);
    
        // Add content with Markdown support
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
    
        if (message.role === 'assistant' && typeof marked !== 'undefined') {
            contentDiv.innerHTML = marked.parse(message.content);
            Prism.highlightAllUnder(contentDiv);
        } else {
            contentDiv.style.whiteSpace = 'pre-wrap';
            contentDiv.textContent = message.content;
        }
        messageElement.appendChild(contentDiv);
    
        // Add timestamp (except for system messages)
        if (message.role !== 'system') {
            const timestamp = document.createElement('div');
            timestamp.classList.add('message-timestamp');
            timestamp.textContent = message.timestamp;
            messageElement.appendChild(timestamp);
        }
    
        // Add to chat container first
        this.chatMessages.appendChild(messageElement);
    
        // Remove action buttons from previous last message
        const messages = Array.from(this.chatMessages.querySelectorAll('.message'));
        const previousLastMessage = messages[messages.length - 2];
        if (previousLastMessage) {
            const oldActionsDiv = previousLastMessage.querySelector('.message-actions');
            if (oldActionsDiv) {
                oldActionsDiv.remove();
                // Re-add basic action buttons without delete/regenerate
                this.addActionButtons(previousLastMessage, {
                    role: previousLastMessage.classList.contains('user-message') ? 'user' : 'assistant',
                    content: previousLastMessage.querySelector('.message-content').textContent
                }, 'All');
            }
        }
    
        // Add action buttons to new assistant message
        if (message.role === 'user') {
            this.addActionButtons(messageElement, message, 'All');
        } else {
            this.addActionButtons(messageElement, message, 'All');
        }

        // Save to history if not already there
        if (!this.history.some(m => 
            m.content === message.content && 
            m.timestamp === message.timestamp)) {
            this.history.push(message);
            this.saveHistory();
        }
    }

    getMessageHeader(message) {
        switch (message.role) {
            case 'user': return 'User:';
            case 'assistant': return `${message.model}:`;
            case 'system': return 'System message:';
            case 'error': return 'Error:';
            default: return '';
        }
    }

    addActionButtons(messageElement, message, option) {
        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('message-actions');
    
        // Copy button
        const copyButton = document.createElement('button');
        copyButton.classList.add(message.role === 'user' ? 'action-button-user' : 'action-button');
        //copyButton.innerHTML = '⧉ Copy';
        copyButton.innerHTML = '<i class="fas fa-copy"></i>&nbsp;Copy';
        copyButton.onclick = () => this.handleCopy(copyButton, message.content);
        actionsDiv.appendChild(copyButton);
    
        // Check if this is the last message
        const messages = Array.from(this.chatMessages.querySelectorAll('.message'));
        const isLastMessage = messages.length === 0 || messages[messages.length - 1] === messageElement;
        
        if (isLastMessage && option == 'All') {
            // Add delete button
            const deleteButton = document.createElement('button');
            deleteButton.classList.add(message.role === 'user' ? 'action-button-user' : 'action-button');
            //deleteButton.innerHTML =  '⌦ Delete';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>&nbsp;Delete';
            deleteButton.onclick = () => this.deleteMessage(messageElement);
            actionsDiv.appendChild(deleteButton);
    
            // Add regenerate button if it's a user message
            if (message.role === 'user') {
                const regenerateButton = document.createElement('button');
                regenerateButton.classList.add(message.role === 'user' ? 'action-button-user' : 'action-button');
                //regenerateButton.innerHTML = '↻ Resend';
                regenerateButton.innerHTML = '<i class="fas fa-redo"></i>&nbsp;Resend';
                regenerateButton.onclick = () => this.regenerateResponse();
                actionsDiv.appendChild(regenerateButton);
            }
        }
    
        messageElement.appendChild(actionsDiv);
    }

    handleCopy(button, content) {
        navigator.clipboard.writeText(content)
            .then(() => {
                button.innerHTML = '✓ Copied!';
                setTimeout(() => button.innerHTML = '<i class="fas fa-copy"></i>&nbsp;Copy', 2000);
            });
    }

    showTypingIndicator() {
        if (this.typingIndicator) {
            this.typingIndicator.style.display = 'flex';
        }
    }

    hideTypingIndicator() {
        if (this.typingIndicator) {
            this.typingIndicator.style.display = 'block';
        }
    }

    clearChat() {
        const touched = localStorage.getItem('currentConversationTouched');
        
        if (this.chatMessages.innerHTML && touched === "true") {
            if (!confirm('Are you sure you want to clear the current conversation?')) {
                this.messageInput.focus();
                return;
            }
        }

        this.chatMessages.innerHTML = '';
        this.history = [];
        this.currentId = null;
        
        document.getElementById('current-chat').innerHTML = "Conversation: New";
        localStorage.setItem('currentConversation', "New");
        localStorage.removeItem('chatHistory');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('currentFolder');
        localStorage.setItem('currentConversationTouched', "false");

        //Intialize the scroll buttons
        this.app.updateScrollButtons();            
        
        this.messageInput.focus();
    }

    saveHistory() {
        try {
            localStorage.setItem('chatHistory', JSON.stringify(this.history));
            //console.log('History saved:', this.history); // For debugging
        } catch (e) {
            console.error('Error saving chat history:', e);
        }
    }
    
    loadHistory() {
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            try {
                this.history = JSON.parse(savedHistory);
                this.history.forEach(msg => this.addMessage(msg));
                this.addCopyButtonToCodeBlocks();
                
                // Refresh action buttons on the last message
                const messages = this.chatMessages.querySelectorAll('.message');
                const lastMessage = messages[messages.length - 1];
                if (lastMessage) {
                    // Remove existing action buttons
                    const oldActionsDiv = lastMessage.querySelector('.message-actions');
                    if (oldActionsDiv) {
                        oldActionsDiv.remove();
                    }
                    
                    // Add new action buttons
                    const message = this.history[this.history.length - 1];
                    this.addActionButtons(lastMessage, message, 'All');
                }
            } catch (e) {
                console.error('Error loading chat history:', e);
                this.history = [];
            }
        }
    }

    markConversationAsTouched() {
        const currentConversation = localStorage.getItem('currentConversation');
        localStorage.setItem('currentConversationTouched', "true");
        document.getElementById('current-chat').innerHTML = 
            `Conversation: ${currentConversation} *`;
    }

    addCopyButtonToCodeBlocks() {
        document.querySelectorAll('.message-content pre').forEach(block => {
            const button = document.createElement('button');
            button.className = 'copy-code-button';
            button.innerHTML = '<i class="fas fa-copy"></i>&nbsp;Copy';
            
            button.addEventListener('click', () => {
                const code = block.querySelector('code');
                navigator.clipboard.writeText(code.textContent);
                button.innerHTML = '✓ Copied!';
                setTimeout(() => button.innerHTML = '<i class="fas fa-copy"></i>&nbsp;Copy', 2000);
            });
            
            block.appendChild(button);
        });
    }

    deleteMessage(messageElement) {
        // Remove from DOM
        messageElement.remove();
        
        // Get identifiers for the message
        const timestamp = messageElement.querySelector('.message-timestamp')?.textContent;
        const content = messageElement.querySelector('.message-content')?.textContent;
        const isAssistantMessage = messageElement.classList.contains('assistant-message');
        
        // Remove from history using both timestamp and role
        this.history = this.history.filter(msg => 
            !(msg.timestamp === timestamp && 
              ((isAssistantMessage && msg.role === 'assistant') || 
               (!isAssistantMessage && msg.role === 'user')))
        );
        
        // Save the updated history to localStorage and mark conversation as touched
        this.markConversationAsTouched();
        this.saveHistory();
        localStorage.setItem('chatHistory', JSON.stringify(this.history));
        
        // Refresh action buttons on the new last message
        const messages = Array.from(this.chatMessages.querySelectorAll('.message'));
        const lastMessage = messages[messages.length - 1];
        if (lastMessage) {
            // Remove existing action buttons
            const oldActionsDiv = lastMessage.querySelector('.message-actions');
            if (oldActionsDiv) {
                oldActionsDiv.remove();
            }
            
            // Add new action buttons
            const isUserMessage = lastMessage.classList.contains('user-message');
            const message = {
                role: isUserMessage ? 'user' : 'assistant',
                content: lastMessage.querySelector('.message-content').textContent
            };
            
            // If we just deleted an assistant message and the last message is now a user message,
            // we need to ensure the regenerate button appears
            const wasAssistantMessage = messageElement.classList.contains('assistant-message');
            if (wasAssistantMessage && isUserMessage) {
                this.addActionButtons(lastMessage, message, 'All');
            } else {
                this.addActionButtons(lastMessage, message, 'All');
            }
        }
    
        // For debugging
        //console.log('Updated history after deletion:', this.history);
    }
    
    async regenerateResponse() {
        // Get all messages from DOM
        const messages = Array.from(this.chatMessages.querySelectorAll('.message'));
        
        // Find the last user message in DOM
        const lastUserMessage = messages.filter(msg => msg.classList.contains('user-message')).pop();
        
        if (!lastUserMessage) return;
    
        // Get the user message content
        const userContent = lastUserMessage.querySelector('.message-content').textContent;
    
        // Remove only the previous assistant message if it exists
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.classList.contains('assistant-message')) {
            lastMessage.remove();
            // Also remove from history
            this.history = this.history.filter(msg => msg.role !== 'assistant' || 
                msg.timestamp !== lastMessage.querySelector('.message-timestamp').textContent);
        }
    
        // Ensure the history only includes messages up to the last user message
        const lastUserIndex = this.history.findIndex(msg => 
            msg.content === userContent && msg.role === 'user'
        );
        if (lastUserIndex !== -1) {
            this.history = this.history.slice(0, lastUserIndex + 1);
        }
    
        // Show typing indicator
        this.showTypingIndicator();
    
        try {
            // Use the existing sendMessage method
            const response = await this.sendMessage(userContent);
            this.hideTypingIndicator();
    
            if (response.ok) {
                const data = await response.json();
                const settings = JSON.parse(localStorage.getItem('chatSettings'));
                this.addBotMessage(data.response, settings.model);
                this.markConversationAsTouched();
                this.saveHistory();
            } else {
                const errorData = await response.text();
                console.error('Server error:', errorData);
                throw new Error(errorData);
            }
        } catch (error) {
            console.error('Error regenerating response:', error);
            this.hideTypingIndicator();
            this.addErrorMessage('Failed to regenerate response from server: ' + error.message);
        }
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}
