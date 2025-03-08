// components/conversationManager.js
import { API_ENDPOINTS } from '../utils/constants.js';
import { ConversationApi } from '../api/conversationApi.js';
import { showLoadingOverlay, removeLoadingOverlay, escapeHTML, formatDate, renderHighlightedText } from '../utils/helpers.js';

export class ConversationManager {
    constructor(chatInstance, app) {
        this.chat = chatInstance;
        this.app = app;
        this.currentId = localStorage.getItem('currentConversationId');
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('save-conversation')
            .addEventListener('click', async () => {
                const chatMessages = document.getElementById('chat-messages');
                const saveButton = document.getElementById('save-conversation');
                const messageInput = document.getElementById('message-input');
                if (this.chat.history.length === 0) {
                    return;
                }
                const loadingOverlay = showLoadingOverlay(chatMessages, 'Saving conversation...');
                saveButton.disabled = true;
                messageInput.disabled = true;

                try {
                    await this.showSaveDialog();
                } catch (error) {
                    console.error('Error showing save dialog:', error);
                    alert('Error showing save dialog');
                } finally {
                    removeLoadingOverlay(loadingOverlay);
                    saveButton.disabled = false;
                    messageInput.disabled = false;
                    messageInput.focus();
                }
            });

        document.getElementById('load-conversations')
            .addEventListener('click', async () => {
                const chatMessages = document.getElementById('chat-messages');
                const loadButton = document.getElementById('load-conversations');
                const messageInput = document.getElementById('message-input');
                const currentConversationTouched = localStorage.getItem('currentConversationTouched');

                if (chatMessages.innerHTML.length > 0 && currentConversationTouched === "true") {
                    if (!confirm('Are you sure you want to clear the current conversation?')) {
                        messageInput.focus();
                        return;
                    }
                }

                const loadingOverlay = showLoadingOverlay(chatMessages, 'Opening conversations...');
                loadButton.disabled = true;
                messageInput.disabled = true;

                try {
                    const conversations = await ConversationApi.getAll();
                    await this.showLoadDialog(conversations);
                } catch (error) {
                    console.error('Failed to load conversations:', error);
                    alert('Failed to load conversations');
                } finally {
                    removeLoadingOverlay(loadingOverlay);
                    loadButton.disabled = false;
                    messageInput.disabled = false;
                    messageInput.focus();
                }
            });
    }

    async showSaveDialog() {
        const folders = await this.getFolders();
        const currentFolder = localStorage.getItem('currentFolder') || '';

        const dialog = document.createElement('div');
        dialog.className = 'conversation-selector';
        dialog.innerHTML = `
            <div class="save-conversation">
                <span class="close">&times;</span>
                <h3>Save Conversation</h3>
                <div class="form-group">
                    <label for="conversation-name">Conversation Name:</label>
                    <input type="text" id="conversation-name" maxlength="45" 
                        placeholder="Enter a name for this conversation"
                        value="${this.getDefaultConversationName()}"
                    >
                </div>
                <div class="form-group">
                    <label for="folder-select">Folder:</label>
                    <div class="folder-selection-area">
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
                        </div>
                        <div id="new-folder-input" class="form-group" style="display: none;">
                            <input type="text" id="new-folder" class="new-folder" maxlength="20" placeholder="Enter new folder name">
                        </div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button id="new-folder-button" class="new-folder-button" type="button">New Folder</button>
                    <div class="right-buttons">
                        <button id="save-button" class="save-button">Save</button>
                        <button class="cancel-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        this.setupSaveDialogListeners(dialog);
    }

    setupSaveDialogListeners(dialog) {
        const closeDialog = () => {
            dialog.remove();
            document.removeEventListener('keydown', handleEscape);
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') closeDialog();
        };
            
        dialog.querySelector('.close').onclick = closeDialog;
        dialog.querySelector('.cancel-button').onclick = closeDialog;
        document.addEventListener('keydown', handleEscape);

        dialog.querySelector('#new-folder-button').onclick = () => this.toggleNewFolderInput();

        dialog.querySelector('#save-button').onclick = async () => {
            const name = document.getElementById('conversation-name').value.trim();
            const folderSelect = document.getElementById('folder-select');
            const newFolderInput = document.getElementById('new-folder');
            const folder = newFolderInput.style.display !== 'none' && newFolderInput.value.trim()
                ? newFolderInput.value.trim()
                : folderSelect.value;

            if (!this.validateSaveInputs(name, folder)) return;

            const exists = await this.checkConversationExists(name, folder);
            if (exists) {
                if (!confirm(`A conversation named "${name}" already exists in folder "${folder}". Do you want to overwrite it?`)) {
                    return;
                }
            }

            await this.saveConversation(name, folder);
            closeDialog();
        };
    }

    async showLoadDialog(conversations) {
        const dialog = document.createElement('div');
        dialog.className = 'conversation-selector';
        dialog.innerHTML = `
            <div class="conversation-selector-content">
                <span class="close">&times;</span>
                <h3>Open Conversation</h3>
                
                <!-- Top navigation tabs -->
                <div class="dialog-tabs">
                    <div class="tab-item active" data-page="browse">
                        <i class="fas fa-folder"></i> Browse
                    </div>
                    <div class="tab-item" data-page="recent">
                        <i class="fas fa-clock"></i> Recent
                    </div>
                    <div class="tab-item" data-page="search">
                        <i class="fas fa-search"></i> Search
                    </div>
                </div>
                
                <!-- Main content area -->
                <div class="dialog-content">
                    <!-- Browse page -->
                    <div class="dialog-page" id="browse-page">
                        <div class="page-header">
                            <label for="folder-filter">Folder:</label>
                            <div class="folder-select-container">
                                <select id="folder-filter" class="folder-filter">
                                    <option value="">All Folders</option>
                                    ${Object.keys(this.organizeConversationsByFolder(conversations)).map(folder => 
                                        `<option value="${escapeHTML(folder)}">${escapeHTML(folder)}</option>`
                                    ).join('')}
                                </select>
                            </div>
                        </div><br>
                        <div class="conversation-list">
                            ${this.generateConversationList(this.organizeConversationsByFolder(conversations))}
                        </div>
                    </div>
                    
                    <!-- Recent page -->
                    <div class="dialog-page" id="recent-page" style="display: none;">
                        <div class="page-header">
                        </div>
                        <div class="conversation-list" id="recent-conversations-list">
                            ${this.generateRecentConversationsList(conversations)}
                        </div>
                    </div>
                    
                    <!-- Search page -->
                    <div class="dialog-page" id="search-page" style="display: none;">
                        <div class="page-header">
                            <div class="search-container">
                                <input type="text" id="conversation-search" 
                                    placeholder="Search conversations by name, folder or content...">
                                <button id="search-button">
                                    <i class="fas fa-search"></i>
                                </button>
                            </div>
                        </div>
                        <div class="conversation-list" id="search-results-list">
                            <div class="search-placeholder">
                                Enter search terms above to find conversations
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="dialog-footer">
                    <button class="close-selector">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        this.setupLoadDialogListeners(dialog);
        this.setupNavigationListeners(dialog);
    }

    setupNavigationListeners(dialog) {
        // Handle navigation between tabs
        const tabItems = dialog.querySelectorAll('.tab-item');
        const pages = dialog.querySelectorAll('.dialog-page');
        
        tabItems.forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                tabItems.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Show the selected page, hide others
                const targetPage = tab.dataset.page;
                pages.forEach(page => {
                    page.style.display = page.id === `${targetPage}-page` ? 'block' : 'none';
                });
                
                // Special handling for search page
                if (targetPage === 'search') {
                    dialog.querySelector('#conversation-search').focus();
                }
            });
        });
        
        // Set up search functionality
        const searchInput = dialog.querySelector('#conversation-search');
        const searchButton = dialog.querySelector('#search-button');
        
        const performSearch = async () => {
            const query = searchInput.value.trim();
            if (!query) return;
            
            const searchResultsList = dialog.querySelector('#search-results-list');
            searchResultsList.innerHTML = '<div class="loading-indicator">Searching...</div>';
            
            try {
                const results = await this.searchConversations(query);
                if (results.length === 0) {
                    searchResultsList.innerHTML = '<div class="no-results">No conversations found matching your search</div>';
                } else {
                    searchResultsList.innerHTML = this.generateSearchResultsList(results);
                    this.setupConversationActions(dialog);
                }
            } catch (error) {
                console.error('Search error:', error);
                searchResultsList.innerHTML = '<div class="error-message">Error performing search</div>';
            }
        };
        
        searchButton.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    generateSearchResultsList(results) {
        if (results.length === 0) {
            return '<div class="no-results">No conversations found matching your search</div>';
        }
        
        return results.map(conv => {
            // Create a clean conversation object without the highlighted fields
            // to avoid any issues when parsing the data-conversation attribute
            const conversationData = {
                id: conv.id,
                name: conv.name,
                folder: conv.folder,
                updated_at: conv.updated_at,
                message_count: conv.message_count
            };
            
            // Serialize to JSON and ensure it's properly escaped for HTML attribute
            const safeJsonData = JSON.stringify(conversationData)
                .replace(/&/g, '&amp;')
                .replace(/'/g, '&apos;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            // Use highlighted versions if available, otherwise use regular versions
            const nameDisplay = conv.highlightedName ? 
                renderHighlightedText(conv.highlightedName) : 
                escapeHTML(conv.name);
                
            const folderDisplay = conv.highlightedFolder ? 
                renderHighlightedText(conv.highlightedFolder) : 
                escapeHTML(conv.folder);
                
            const contentDisplay = conv.matchedContent ? 
                renderHighlightedText(conv.matchedContent) : 
                '';
            
            return `
                <div class="conversation-item" data-conversation="${safeJsonData}">
                    <div class="conversation-content">
                        <div class="conversation-name" data-id="${conv.id}">
                            <span class="name-text">${nameDisplay}</span>
                            <input type="text" class="name-edit" 
                                value="${escapeHTML(conv.name)}" 
                                style="display: none;">
                        </div>
                        <div class="conversation-info">
                            <span class="conversation-date">
                                ${formatDate(new Date(conv.updated_at))} (${conv.message_count} messages)
                            </span>
                            <span class="conversation-folder">${folderDisplay}</span>
                        </div>
                        ${contentDisplay ? `
                        <div class="match-preview">
                            <div class="match-label">&nbsp;</div>
                            <div class="match-text">${contentDisplay}</div>
                        </div>` : ''}
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
            `;
        }).join('');
    }    
         
    async searchConversations(query) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }
    
            const response = await fetch(`${API_ENDPOINTS.CONVERSATIONS}/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query })
            });
    
            if (!response.ok) {
                throw new Error('Failed to search conversations');
            }
    
            return await response.json();
        } catch (error) {
            console.error('Error searching conversations:', error);
            throw error;
        }
    }
    
    setupLoadDialogListeners(dialog) {
        const closeDialog = () => {
            dialog.remove();
            document.removeEventListener('keydown', handleEscape);
        };
    
        const handleEscape = (event) => {
            if (event.key === 'Escape') closeDialog();
        };
        dialog.querySelector('.close').onclick = closeDialog;
        dialog.querySelector('.close-selector').onclick = closeDialog;
        document.addEventListener('keydown', handleEscape);
    
        // Folder filter functionality
        const folderFilter = dialog.querySelector('#folder-filter');
        if (folderFilter) {
            folderFilter.addEventListener('change', (e) => {
                const selectedFolder = e.target.value;
                const folderSections = dialog.querySelectorAll('.folder-section');
                folderSections.forEach(section => {
                    section.style.display = !selectedFolder || section.dataset.folder === selectedFolder
                        ? 'block' 
                        : 'none';
                });
            });
        }
    
        // Use event delegation for conversation clicks
        dialog.addEventListener('click', (e) => {
            // Find the closest conversation-item ancestor of the clicked element
            const conversationItem = e.target.closest('.conversation-item');
            
            // If we found a conversation item and the click wasn't on action buttons
            if (conversationItem && 
                !e.target.closest('.conversation-actions') && 
                !e.target.closest('.name-edit')) {
                
                const conversationData = this.debugConversationData(conversationItem);
                if (conversationData) {
                    this.loadConversation(conversationData);
                    closeDialog();
                }
            }            
        });
    
        // Setup tab navigation
        dialog.querySelectorAll('.tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                dialog.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Show the selected page, hide others
                const targetPage = tab.dataset.page;
                dialog.querySelectorAll('.dialog-page').forEach(page => {
                    page.style.display = page.id === `${targetPage}-page` ? 'block' : 'none';
                });
                
                // Special handling for search page
                if (targetPage === 'search') {
                    const searchInput = dialog.querySelector('#conversation-search');
                    if (searchInput) searchInput.focus();
                }
            });
        });
        
        // Setup search functionality
        const searchInput = dialog.querySelector('#conversation-search');
        const searchButton = dialog.querySelector('#search-button');
        
        if (searchInput && searchButton) {
            const performSearch = async () => {
                const query = searchInput.value.trim();
                if (!query) return;
                
                const searchResultsList = dialog.querySelector('#search-results-list');
                searchResultsList.innerHTML = '<div class="loading-indicator">Searching...</div>';
                
                try {
                    const results = await this.searchConversations(query);
                    if (results.length === 0) {
                        searchResultsList.innerHTML = '<div class="no-results">No conversations found matching your search</div>';
                    } else {
                        searchResultsList.innerHTML = this.generateSearchResultsList(results);
                        // Setup rename/delete actions for the new elements
                        this.setupConversationActions(dialog);
                    }
                } catch (error) {
                    console.error('Search error:', error);
                    searchResultsList.innerHTML = '<div class="error-message">Error performing search</div>';
                }
            };
            
            searchButton.addEventListener('click', performSearch);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch();
            });
        }
    
        // Setup rename and delete buttons
        this.setupConversationActions(dialog);
    }   
    
    async saveConversation(name, folder) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const currentId = localStorage.getItem('currentConversationId');
            const endpoint = currentId 
                ? `${API_ENDPOINTS.CONVERSATIONS}/${currentId}`
                : API_ENDPOINTS.CONVERSATIONS;

            const response = await fetch(endpoint, {
                method: currentId ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.replace("'", ""),
                    folder: folder,
                    messages: this.chat.history
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save conversation');
            }

            const result = await response.json();
            
            if (result.id) {
                this.currentId = result.id;
                localStorage.setItem('currentConversationId', this.currentId);
            }

            localStorage.setItem('currentFolder', folder);
            localStorage.setItem('currentConversation', name);
            document.getElementById('current-chat').innerHTML = "Conversation: " + name;
            localStorage.setItem('currentConversationTouched', "false");

        } catch (error) {
            console.error('Error saving conversation:', error);
            if (error.message.includes('401')) {
                this.handleAuthenticationError();
            } else {
                throw error;
            }
        }
    }

    async loadConversation(conversation) {
        console.log('Loading conversation:', conversation); // Add this for debugging
        
        const chatMessages = document.getElementById('chat-messages');
        const currentChatElement = document.getElementById('current-chat');
        const messageInput = document.getElementById('message-input');
    
        const originalContent = chatMessages.innerHTML;
        const originalCurrentChat = currentChatElement.innerHTML;
    
        const loadingOverlay = showLoadingOverlay(chatMessages, 'Loading conversation...');
        messageInput.disabled = true;
    
        try {
            this.chat.history = [];
            currentChatElement.innerHTML = `Conversation: ${conversation.name}`;
            
            localStorage.setItem('currentFolder', conversation.folder);
            localStorage.setItem('currentConversation', conversation.name);
            this.currentId = conversation.id;
            
            const conversationData = await this.getConversationMessages(conversation.id);
            this.chat.history = conversationData[0].messages.map(message => ({
                role: message.role,
                content: message.content,
                timestamp: message.timestamp,
                model: message.model
            }));
    
            chatMessages.innerHTML = '';
            this.chat.history.forEach(msg => this.chat.addMessage(msg));
            this.chat.addCopyButtonToCodeBlocks();
    
            localStorage.setItem('chatHistory', JSON.stringify(this.chat.history));
            localStorage.setItem('currentConversationId', this.currentId);
            localStorage.setItem('currentConversationTouched', "false");
    
            // Scroll to the top of the chat
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.scrollTop = 0;
    
            //Intialize the scroll buttons
            this.app.updateScrollButtons();            
        } catch (error) {
            console.error('Error loading conversation:', error);
            alert('Error loading conversation');
            chatMessages.innerHTML = originalContent;
            currentChatElement.innerHTML = originalCurrentChat;
        } finally {
            removeLoadingOverlay(loadingOverlay);
            messageInput.disabled = false;
            messageInput.focus();
        }
    }
    
    // Helper methods for conversation management
    async getFolders() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return [];

            const response = await fetch(API_ENDPOINTS.FOLDERS, {
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

    async checkConversationExists(name, folder) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_ENDPOINTS.CONVERSATIONS}/check`, {
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

    async getConversationMessages(conversationId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const response = await fetch(`/api/conversation/${conversationId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch conversation messages');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching conversation:', error);
            throw error;
        }
    }

    // Helper methods for dialog management
    toggleNewFolderInput() {
        const folderSelect = document.getElementById('folder-select');
        const newFolderInput = document.getElementById('new-folder-input');
        const newFolderButton = document.getElementById('new-folder-button');

        if (newFolderInput.style.display === 'none') {
            newFolderInput.style.display = 'block';
            folderSelect.style.display = 'none';
            newFolderButton.innerHTML = "Back";
        } else {
            newFolderInput.style.display = 'none';
            folderSelect.style.display = 'block';
            newFolderButton.innerHTML = "New Folder";
        }
    }

    getDefaultConversationName() {
        const currentConversation = localStorage.getItem('currentConversation');
        
        if (currentConversation !== 'New') {
            return currentConversation;
        }

        const firstMessage = this.chat.history[1];
        if (firstMessage) {
            const name = firstMessage.content.substring(0, 45) + 
                (firstMessage.content.length > 45 ? '...' : '');
            return name.replace("'", "");
        }

        return `Conversation ${formatDate(new Date())}`;
    }

    organizeConversationsByFolder(conversations) {
        return conversations.reduce((acc, conv) => {
            if (!acc[conv.folder]) {
                acc[conv.folder] = [];
            }
            acc[conv.folder].push(conv);
            return acc;
        }, {});
    }

    generateConversationList(conversationsByFolder) {
        return Object.entries(conversationsByFolder).map(([folder, convs]) => {
            const conversationItems = convs.map((conv) => {
                // Create a clean conversation object
                const conversationData = {
                    id: conv.id,
                    name: conv.name,
                    folder: conv.folder,
                    updated_at: conv.updated_at,
                    message_count: conv.message_count || 0
                };
                
                // Serialize to JSON and ensure it's properly escaped for HTML attribute
                const safeJsonData = JSON.stringify(conversationData)
                    .replace(/&/g, '&amp;')
                    .replace(/'/g, '&apos;')
                    .replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                    
                return `
                    <div class="conversation-item" data-conversation="${safeJsonData}">
                        <div class="conversation-content">
                            <div class="conversation-name" data-id="${conv.id}">
                                <span class="name-text">${escapeHTML(conv.name)}</span>
                                <input type="text" class="name-edit" 
                                    value="${escapeHTML(conv.name)}" 
                                    style="display: none;">
                            </div>
                            <div class="conversation-date">
                                ${formatDate(new Date(conv.updated_at))} (${conv.message_count || 0} messages)
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
                `;
            }).join('');
            
            return `
                <div class="folder-section" data-folder="${escapeHTML(folder)}">
                    <div class="folder-header">${escapeHTML(folder)}</div>
                    ${conversationItems}
                </div>
            `;
        }).join('');
    }
    
    generateRecentConversationsList(conversations) {
        // Sort conversations by updated_at date, most recent first
        const recentConversations = [...conversations].sort((a, b) => 
            new Date(b.updated_at) - new Date(a.updated_at)
        ).slice(0, 10); // Get only the 10 most recent
        
        if (recentConversations.length === 0) {
            return '<div class="no-conversations">No recent conversations found</div>';
        }
        
        return recentConversations.map(conv => {
            // Create a clean conversation object
            const conversationData = {
                id: conv.id,
                name: conv.name,
                folder: conv.folder,
                updated_at: conv.updated_at,
                message_count: conv.message_count || 0
            };
            
            // Serialize to JSON and ensure it's properly escaped for HTML attribute
            const safeJsonData = JSON.stringify(conversationData)
                .replace(/&/g, '&amp;')
                .replace(/'/g, '&apos;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
                
            return `
                <div class="conversation-item" data-conversation="${safeJsonData}">
                    <div class="conversation-content">
                        <div class="conversation-name" data-id="${conv.id}">
                            <span class="name-text">${escapeHTML(conv.name)}</span>
                            <input type="text" class="name-edit" 
                                value="${escapeHTML(conv.name)}" 
                                style="display: none;">
                        </div>
                        <div class="conversation-info">
                            <span class="conversation-date">
                                ${formatDate(new Date(conv.updated_at))} (${conv.message_count || 0} messages)
                            </span>
                            <span class="conversation-folder">${escapeHTML(conv.folder)}</span>
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
            `;
        }).join('');
    }
    
    setupConversationActions(dialog) {
        // Setup rename functionality
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

                const handleRename = async () => {
                    const newName = nameInput.value.trim();
                    if (newName && newName !== nameText.textContent) {
                        const conversation = JSON.parse(item.dataset.conversation);
                        await this.renameConversation(conversation.id, newName);
                        nameText.textContent = newName;
                    }
                    nameText.style.display = 'block';
                    nameInput.style.display = 'none';
                };

                nameInput.addEventListener('blur', handleRename);
                nameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        nameInput.blur();
                    }
                });
            });
        });

        // Setup delete functionality
        dialog.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const item = btn.closest('.conversation-item');
                const conversation = JSON.parse(item.dataset.conversation);

                if (confirm(`Are you sure you want to delete "${conversation.name}"?`)) {
                    await this.deleteConversation(item, conversation);
                }
            });
        });
    }

    async renameConversation(id, newName) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const response = await fetch(`/api/rename-conversation/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName })
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

    async deleteConversation(item, conversation) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const response = await fetch(`/api/conversations/${conversation.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete conversation');
            }

            // Remove the item from the UI
            item.remove();

            // Remove folder section if empty
            // const folderSection = item.closest('.folder-section');
            // if (!folderSection.querySelector('.conversation-item')) {
            //     folderSection.remove();

                // Update folder filter options
            //     const folderFilter = document.querySelector('#folder-filter');
            //     const option = folderFilter.querySelector(
            //         `option[value="${conversation.folder}"]`
            //     );
            //     if (option) option.remove();
            // }

            return await response.json();
        } catch (error) {
            console.error('Error deleting conversation:', error);
            alert('Failed to delete conversation');
            throw error;
        }
    }

    validateSaveInputs(name, folder) {
        if (!name) {
            alert('Please enter a name for the conversation');
            return false;
        }
        if (!folder) {
            alert('Please select or create a folder');
            return false;
        }
        return true;
    }

    handleAuthenticationError() {
        localStorage.removeItem('token');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('currentFolder');
        alert('Your session has expired. Please login again.');
        window.location.href = '/static/login.html';
    }

    debugConversationData(conversationItem) {
        console.log('Conversation element:', conversationItem);
        console.log('Raw data-conversation:', conversationItem.getAttribute('data-conversation'));
        try {
            const data = JSON.parse(conversationItem.getAttribute('data-conversation'));
            console.log('Parsed data:', data);
            return data;
        } catch (error) {
            console.error('Error parsing conversation data:', error);
            console.log('Character at error position:', 
                conversationItem.getAttribute('data-conversation').charAt(error.message.match(/position (\d+)/)?.[1] || 0));
            return null;
        }
    }
}