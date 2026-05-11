// RTC client instance
let client = null;

// Declare variables for the local tracks
let localAudioTrack = null; 
let localVideoTrack = null; 
let remoteUsers = {};
let isJoined = false;
let isMuted = false;
let isVideoMuted = false;
let isCapturing = false;
let isVideoCapturing = false;
let cameraDevices = new Map(); // Store camera devices with their IDs and names
let microphoneDevices = new Map(); // Store microphone devices with their IDs and names
let myAgentsId = null;
let agentUid = null;
let crd = null; // Geolocation
let agentOn = false;

// Audio analysis variables for AI agent effects
let audioContext = null;
let analyser = null;
let dataArray = null;
let animationId = null;
let agentAudioSource = null;
let preserveColorFilter = null; // Flag to preserve color changes

// User state
const userState = {
    isMicMuted: false,
    isMicCapturing: true,
    isCameraMuted: false,
    isCameraCapturing: true
};

// Variable Connection parameters
let channel = null; // Will be set when joining
let uid = ""; // User ID

// Track users in the channel, their UID, mic/cam states, join order, and metadata
let usersInChannel = [];

//agent transcript business
const messagesMap = new Map();

// --- Share Link Modal Logic ---
let isShareModalOpen = false;

function getShareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('appid', document.getElementById('appId').value);
    url.searchParams.set('channel', document.getElementById('channel').value);
    return url.toString();
}

function showShareLinkModal() {
    const modal = document.getElementById('shareLinkModal');
    const shareUrl = getShareLink();
    modal.innerHTML = `
        <div style="display: flex; align-items: flex-start;">
            <div style="width: 0; height: 0; border-top: 24px solid transparent; border-bottom: 24px solid transparent; border-right: 32px solid white; margin-top: 18px; margin-left: -16px;"></div>
            <div style="background: white; color: black; border-radius: 6px; box-shadow: 0 2px 12px rgba(0,0,0,0.12); padding: 18px 24px; min-width: 340px; font-size: 1.1em; font-family: inherit; border: 2px solid #00C2FF;">
                <div style="font-weight: bold; color: #222; margin-bottom: 6px;">Click and share this link with others!</div>
                <div id="shareLinkUrl" style="margin-bottom: 8px; word-break: break-all; background: #f7f7f7; border-radius: 4px; padding: 6px 8px; font-family: monospace; font-size: 0.98em; color: #0077cc; cursor: pointer; transition: background 0.2s, color 0.2s, opacity 1s; user-select: all;">${shareUrl}</div>
                <div style="color: #222;">Click the Agora icon to close this message or show the link again anytime!</div>
            </div>
        </div>
    `;
    modal.style.display = 'block';
    modal.style.background = '#00C2FF';
    isShareModalOpen = true;

    // Add clipboard and animation logic
    const urlElem = document.getElementById('shareLinkUrl');
    if (urlElem) {
        urlElem.onclick = async function() {
            try {
                await navigator.clipboard.writeText(shareUrl);
            } catch (e) {
                // fallback for older browsers
                const range = document.createRange();
                range.selectNode(urlElem);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                document.execCommand('copy');
                window.getSelection().removeAllRanges();
            }
            urlElem.style.background = '#0077cc';
            urlElem.style.color = 'white';
            urlElem.style.opacity = '0.7';
            setTimeout(() => {
                urlElem.style.transition = 'background 0.6s, color 0.6s, opacity 1s';
                urlElem.style.background = '#f7f7f7';
                urlElem.style.color = 'white';
                urlElem.style.opacity = '1';
            }, 50);
        };
    }
    
    // Auto-hide modal after 5 seconds
    setTimeout(() => {
        if (isShareModalOpen) {
            hideShareLinkModal();
        }
    }, 5000);
}

function hideShareLinkModal() {
    const modal = document.getElementById('shareLinkModal');
    modal.style.display = 'none';
    isShareModalOpen = false;
}

function toggleShareLinkModal() {
    if (!isJoined) return;
    if (isShareModalOpen) {
        hideShareLinkModal();
    } else {
        showShareLinkModal();
    }
}

// Attach event to agora icon
window.addEventListener('DOMContentLoaded', function() {
    const agoraIcon = document.getElementById('agoraIcon');
    if (agoraIcon) {
        agoraIcon.addEventListener('click', function() {
            toggleShareLinkModal();
        });
    }
});

// Show modal after joining, hide after leaving
const originalJoinChannel = joinChannel;
joinChannel = async function() {
    await originalJoinChannel.apply(this, arguments);
    isJoined = true;
    showShareLinkModal();
    updateButtonStates();
};

const originalLeaveChannel = leaveChannel;
leaveChannel = async function() {
    await originalLeaveChannel.apply(this, arguments);
    isJoined = false;
    hideShareLinkModal();
};

// Generate random alphanumeric string of specified length
function generateRandomChannel(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    document.getElementById('channel').value = result;
    return result;
}

function generateRandomUID(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    document.getElementById('uid').value = result;
    return result;
}

// Initialize the AgoraRTC client
function initializeClient() {
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp9" });
    setupEventListeners();
}

// Handle client events
function setupEventListeners() {

    client.on("stream-message", handleAgentStreamMessage);

    client.on("user-joined", async (user) => {
        if (user.uid.includes("agent")) {
            console.log(`Agent ${user.uid} joined channel`);
            log(`Agent ${user.uid} joined channel`);
            const agentMetadata = user.uid.split('-', 1)[0] + "'s AI";
            usersInChannel.push({
                uid: user.uid,
                mic: 'unmuted',
                cam: 'muted',
                metadata: agentMetadata
            });
            //in the future, display the ai agent in a different way that regular user
        } else {
        // Add remote user to usersInChannel
        usersInChannel.push({
            uid: user.uid,
            mic: 'muted',
            cam: 'muted',
            metadata: 'Remote'
        });
    }
        displayRemoteUser(user);
        logUsersInChannel();

    });

    client.on("user-left", (user) => {
        console.log(`user ${user.uid} left channel`);
        log(`user ${user.uid} left channel`);
        // Remove user from usersInChannel
        const idx = usersInChannel.findIndex(u => u.uid === user.uid);
        if (idx !== -1) usersInChannel.splice(idx, 1);
        const remotePlayerContainer = document.getElementById(user.uid);
        remotePlayerContainer && remotePlayerContainer.remove();
        logUsersInChannel();
        
        // Update the grid layout after remote user leaves
        updateRemoteUserGrid();
        
        // Update local video position after remote user leaves
        updateLocalVideoPosition();
    });

    client.on("user-published", async (user, mediaType) => {
        log(`subscribing to user ${user.uid} ${mediaType}`);
        await client.subscribe(user, mediaType);
        console.log("subscribe success");
        // Update user state in usersInChannel
        const idx = usersInChannel.findIndex(u => u.uid === user.uid);
        if (idx !== -1) {
            if (mediaType === 'video') usersInChannel[idx].cam = 'unmuted';
            if (mediaType === 'audio') usersInChannel[idx].mic = 'unmuted';
            logUsersInChannel();
        }
        if (mediaType === "video") {
            playRemoteVideo(user);
        }
        if (mediaType === "audio") {
            user.audioTrack.play();
            
            // Start audio analysis for AI agents
            if (user.uid.includes("agent")) {
                console.log(`Agent ${user.uid} audio track published, starting audio analysis`);
                startAudioAnalysis(user.audioTrack);
            }
        }
        if (user.uid.includes("agent")) {
            console.log(`Agent ${user.uid} can speak.`);
        } else {
            updateRemotePlayerContainer(user.uid);
        }
    });

    client.on("user-unpublished", (user, mediaType) => {
        log(`unsubscribing from user ${user.uid} ${mediaType}`);
        // Update user state in usersInChannel
        const idx = usersInChannel.findIndex(u => u.uid === user.uid);
        if (idx !== -1) {
            if (mediaType === 'video') usersInChannel[idx].cam = 'muted';
            if (mediaType === 'audio') usersInChannel[idx].mic = 'muted';
            logUsersInChannel();
        }
        
        // Stop audio analysis if AI agent stops publishing audio
        if (mediaType === 'audio' && user.uid.includes('agent')) {
            console.log(`Agent ${user.uid} audio track unpublished, stopping audio analysis`);
            stopAudioAnalysis();
        }
        
        // let's update the remotePlayerContainer here, based on the state of usersInChannel values
        // This is only firing because either .cam or .mic is now 'muted' so we should show an icon at least
        updateRemotePlayerContainer(user.uid);
    });

    //Add some disconnect logic for connection state and peerconnection state later
    //client.on("connection-state-change", (cur, prev, reason) => {
    //    if (cur === "DISCONNECTED") {
    //        log(`WebSocket Connection state changed to ${cur} from ${prev} for reason ${reason}.`);
    //    } else {
    //        log(`WebSocket Connection state changed to ${cur}.`);
    //    }
    //});
    //
    //client.on("peerconnection-state-change", (curState, revState) => {
    //    if (curState === "disconnected") {
    //        log(`Media PeerConnection state changed to ${curState} from ${revState}.`);
    //    } else {
    //        log(`Media PeerConnection state changed to ${curState}.`);
    //    }
    //});
}

function log(message, className = '') {
    const logDiv = document.getElementById("log");
    if (logDiv) {
        const messageDiv = document.createElement('div');
        if (className) messageDiv.className = className;
        messageDiv.append(message);
        logDiv.appendChild(messageDiv);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// Update AI agent transcript display
function updateAgentTranscript(agentUid, transcriptText) {
    const agentContainer = document.getElementById(agentUid);
    if (!agentContainer || !agentContainer.transcriptDiv) {
        console.log(`Agent container not found for UID: ${agentUid}`);
        return;
    }
    
    const transcriptDiv = agentContainer.transcriptDiv;
    
    // Clear existing timer if any
    if (agentContainer.transcriptTimer) {
        clearTimeout(agentContainer.transcriptTimer);
    }
    
    // Update transcript text
    transcriptDiv.textContent = transcriptText;
    transcriptDiv.style.display = "block";
    
    // Set new timer to hide transcript after 10 seconds
    agentContainer.transcriptTimer = setTimeout(() => {
        transcriptDiv.style.display = "none";
        agentContainer.transcriptTimer = null;
    }, 10000);
}

// Update microphone and camera button states based on track availability and user state
function updateButtonStates() {
    const captureMicButton = document.getElementById('captureMic');
    const muteMicButton = document.getElementById('muteMic');
    const captureCameraButton = document.getElementById('captureCamera');
    const muteCameraButton = document.getElementById('muteCamera');
    const aiButton = document.getElementById('aiButton');
    
    // If buttons don't exist yet, return early
    if (!captureMicButton || !muteMicButton || !captureCameraButton || !muteCameraButton || !aiButton) {
        return;
    }

    // Get all button elements first
    const micStatus = captureMicButton.querySelector('.mic-status');
    const micIcon = captureMicButton.querySelector('svg');
    const muteMicIcon = muteMicButton.querySelector('svg');
    const cameraStatus = captureCameraButton.querySelector('.camera-status');
    const cameraIcon = captureCameraButton.querySelector('svg');
    const muteCameraIcon = muteCameraButton.querySelector('svg');
    const aiStatus = aiButton.querySelector('.ai-status');
    const aiIcon = aiButton.querySelector('svg');

    // If any required elements are missing, return early
    if (!micStatus || !micIcon || !muteMicIcon || !cameraStatus || !cameraIcon || !muteCameraIcon || !aiStatus || !aiIcon) {
        return;
    }

    // Update AI button state
    const appId = document.getElementById('appId').value;
    const isAllowedAppId = appId === 'a9a4b25e4e8b4a558aa39780d1a84342';
    
    if (!isJoined || !isAllowedAppId) {
        aiButton.disabled = true;
        aiStatus.className = 'ai-status not-joined';
        aiIcon.style.stroke = 'black';
    } else if (agentOn) {
        aiButton.disabled = false;
        aiStatus.className = 'ai-status active';
        aiIcon.style.stroke = 'white';
    } else {
        aiButton.disabled = false;
        aiStatus.className = 'ai-status joined';
        aiIcon.style.stroke = 'white';
    }

    // Update microphone controls
    if (localAudioTrack) {
        if (userState.isMicMuted) {
            // Microphone is muted
            captureMicButton.disabled = true;
            muteMicButton.disabled = false;
            micStatus.className = 'mic-status muted';
            micIcon.style.stroke = 'black';
        } else {
            // Microphone is not muted
            captureMicButton.disabled = false;
            muteMicButton.disabled = !userState.isMicCapturing;

            if (userState.isMicCapturing) {
                micStatus.className = 'mic-status capturing';
                micIcon.style.stroke = 'white';
            } else {
                micStatus.className = 'mic-status not-capturing';
                micIcon.style.stroke = 'black';
            }
        }

        muteMicIcon.style.stroke = userState.isMicMuted ? '#f44336' : 'white';
    } else {
        captureMicButton.disabled = true;
        muteMicButton.disabled = true;
        micStatus.className = 'mic-status not-joined';
        micIcon.style.stroke = 'black';
        muteMicIcon.style.stroke = 'grey';
    }

    // Update camera controls
    if (localVideoTrack) {
        if (userState.isCameraMuted) {
            // Camera is muted
            captureCameraButton.disabled = true;
            muteCameraButton.disabled = false;
            cameraStatus.className = 'camera-status muted';
            cameraIcon.style.stroke = 'black';
        } else {
            // Camera is not muted
            captureCameraButton.disabled = false;
            muteCameraButton.disabled = !userState.isCameraCapturing;

            if (userState.isCameraCapturing) {
                cameraStatus.className = 'camera-status capturing';
                cameraIcon.style.stroke = 'white';
            } else {
                cameraStatus.className = 'camera-status not-capturing';
                cameraIcon.style.stroke = 'black';
            }
        }

        muteCameraIcon.style.stroke = userState.isCameraMuted ? '#f44336' : 'white';
    } else {
        captureCameraButton.disabled = true;
        muteCameraButton.disabled = true;
        cameraStatus.className = 'camera-status not-joined';
        cameraIcon.style.stroke = 'black';
        muteCameraIcon.style.stroke = 'grey';
    }

    // Ensure buttons maintain their scale during state changes
    [captureMicButton, muteMicButton, captureCameraButton, muteCameraButton, aiButton].forEach(button => {
        if (!button.style.transform) {
            button.style.transform = 'scale(0.6)';
        }
    });
    
    // Ensure logsToggle button maintains its scale and update its state
    const logsToggleButton = document.getElementById('logsToggle');
    if (logsToggleButton) {
        if (!logsToggleButton.style.transform) {
            logsToggleButton.style.transform = 'scale(0.6)';
        }
        
        // Update logs toggle button state based on join status
        if (!isJoined) {
            logsToggleButton.disabled = true;
            logsToggleButton.querySelector('svg').style.stroke = 'grey';
        } else {
            logsToggleButton.disabled = false;
            // Keep current stroke color (white or #00c2ff if logs are visible)
            const logDiv = document.getElementById('log');
            if (logDiv && logDiv.classList.contains('show-logs')) {
                logsToggleButton.querySelector('svg').style.stroke = '#00c2ff';
            } else {
                logsToggleButton.querySelector('svg').style.stroke = 'white';
            }
        }
    }
}

// Handle microphone capture toggle
async function toggleMicrophoneCapture() {
    if (!localAudioTrack) return;

    try {
        userState.isMicCapturing = !userState.isMicCapturing;
        await localAudioTrack.setEnabled(userState.isMicCapturing);
        updateButtonStates();
        updateLocalVideoCameraIcon();
        // Update usersInChannel state
        updateUserState(uid, userState.isMicCapturing ? 'unmuted' : 'muted', userState.isCameraCapturing ? 'unmuted' : 'muted');
    } catch (error) {
        console.error('Error toggling microphone capture:', error);
        log('Error toggling microphone capture: ' + error.message);
    }
}

// Handle microphone mute toggle
async function toggleMicrophoneMute() {
    if (!localAudioTrack || !userState.isMicCapturing) return;

    try {
        userState.isMicMuted = !userState.isMicMuted;
        await localAudioTrack.setMuted(userState.isMicMuted);
        updateButtonStates();
        updateLocalVideoCameraIcon();
        // Update usersInChannel state
        updateUserState(uid, userState.isMicMuted ? 'muted' : 'unmuted', userState.isCameraCapturing ? 'unmuted' : 'muted');
    } catch (error) {
        console.error('Error toggling microphone mute:', error);
        log('Error toggling microphone mute: ' + error.message);
    }
}

// Handle camera capture toggle
async function toggleCameraCapture() {
    if (!localVideoTrack) return;

    try {
        userState.isCameraCapturing = !userState.isCameraCapturing;
        await localVideoTrack.setEnabled(userState.isCameraCapturing);
        updateButtonStates();
        updateLocalVideoCameraIcon();
        // Update usersInChannel state
        updateUserState(uid, userState.isMicCapturing ? 'unmuted' : 'muted', userState.isCameraCapturing ? 'unmuted' : 'muted');
    } catch (error) {
        console.error('Error toggling camera capture:', error);
        log('Error toggling camera capture: ' + error.message);
    }
}

// Handle camera mute toggle
async function toggleCameraMute() {
    if (!localVideoTrack || !userState.isCameraCapturing) return;

    try {
        userState.isCameraMuted = !userState.isCameraMuted;
        await localVideoTrack.setMuted(userState.isCameraMuted);
        updateButtonStates();
        updateLocalVideoCameraIcon();
        // Update usersInChannel state
        updateUserState(uid, userState.isMicCapturing ? 'unmuted' : 'muted', userState.isCameraMuted ? 'muted' : 'unmuted');
    } catch (error) {
        console.error('Error toggling camera mute:', error);
        log('Error toggling camera mute: ' + error.message);
    }
}

// Create local audio and video tracks
async function createLocalTracks() {
    log("createLocalTracks");
    try {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack({encoderConfig: "720p_3"});
        
        // Ensure tracks are enabled
        await localAudioTrack.setEnabled(true);
        await localVideoTrack.setEnabled(true);
        
        // Update user state to match track state
        userState.isMicCapturing = true;
        userState.isCameraCapturing = true;
        userState.isMicMuted = false;
        userState.isCameraMuted = false;
        
        // Update button states after track creation
        updateButtonStates();
    } catch (error) {
        console.error('Error creating local tracks:', error);
        throw error;
    }
}

// Publish local audio and video tracks
async function publishLocalTracks() {
    log("publishLocalTracks");
    await client.publish([localAudioTrack, localVideoTrack]);
}

// Display local video
function displayLocalVideo() {
    const localPlayerContainer = document.createElement("div");
    localPlayerContainer.id = uid;
    localPlayerContainer.style.width = "100%";
    localPlayerContainer.style.height = "100%";
    localPlayerContainer.style.position = "absolute";
    localPlayerContainer.style.top = "0";
    localPlayerContainer.style.left = "0";
    localPlayerContainer.style.transition = "all 0.3s ease-in-out";
    localPlayerContainer.style.transformOrigin = "bottom right";
    localPlayerContainer.style.zIndex = "2";

    // Create device icon container
    const deviceIconContainer = document.createElement("div");
    deviceIconContainer.style.position = "absolute";
    deviceIconContainer.style.top = "20px";
    deviceIconContainer.style.right = "20px";
    deviceIconContainer.style.transform = "none";
    deviceIconContainer.style.display = "none"; // Initially hidden
    deviceIconContainer.style.zIndex = "2";
    deviceIconContainer.style.gap = "60px";
    deviceIconContainer.style.justifyContent = "center";
    deviceIconContainer.style.alignItems = "center";

    // Add camera icon with background
    const cameraIconContainer = document.createElement("div");
    cameraIconContainer.style.position = "relative";
    cameraIconContainer.style.display = "none"; // Initially hidden
    const cameraBackground = document.createElement("div");
    cameraBackground.style.position = "absolute";
    cameraBackground.style.width = "72px";
    cameraBackground.style.height = "72px";
    cameraBackground.style.borderRadius = "50%";
    cameraBackground.style.backgroundColor = "black";
    cameraBackground.style.opacity = "0.5";
    cameraBackground.style.top = "50%";
    cameraBackground.style.left = "50%";
    cameraBackground.style.transform = "translate(-50%, -50%)";
    cameraBackground.style.zIndex = "1";
    const cameraIcon = document.createElement("div");
    cameraIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="grey" stroke-width="2" width="32" height="32">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
        </svg>
    `;
    cameraIcon.style.position = "relative";
    cameraIcon.style.zIndex = "2";
    cameraIconContainer.appendChild(cameraBackground);
    cameraIconContainer.appendChild(cameraIcon);

    // Add microphone icon with background
    const micIconContainer = document.createElement("div");
    micIconContainer.style.position = "relative";
    micIconContainer.style.display = "none"; // Initially hidden
    const micBackground = document.createElement("div");
    micBackground.style.position = "absolute";
    micBackground.style.width = "72px";
    micBackground.style.height = "72px";
    micBackground.style.borderRadius = "50%";
    micBackground.style.backgroundColor = "black";
    micBackground.style.opacity = "0.5";
    micBackground.style.top = "50%";
    micBackground.style.left = "50%";
    micBackground.style.transform = "translate(-50%, -50%)";
    micBackground.style.zIndex = "1";
    const micIcon = document.createElement("div");
    micIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="grey" stroke-width="2" width="32" height="32">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
    `;
    micIcon.style.position = "relative";
    micIcon.style.zIndex = "2";
    micIconContainer.appendChild(micBackground);
    micIconContainer.appendChild(micIcon);

    deviceIconContainer.appendChild(cameraIconContainer);
    deviceIconContainer.appendChild(micIconContainer);
    localPlayerContainer.appendChild(deviceIconContainer);
    document.getElementById('video-container').appendChild(localPlayerContainer);
    localVideoTrack.play(localPlayerContainer);

    // Store references to the icons for later updates
    localPlayerContainer.deviceIconContainer = deviceIconContainer;
    localPlayerContainer.cameraIconContainer = cameraIconContainer;
    localPlayerContainer.micIconContainer = micIconContainer;
    localPlayerContainer.cameraIcon = cameraIcon.querySelector('svg');
    localPlayerContainer.micIcon = micIcon.querySelector('svg');
}

// Update local video position based on users in channel
function updateLocalVideoPosition() {
    const localPlayerContainer = document.getElementById(uid);
    if (!localPlayerContainer) return;
    log("updateLocalVideoPosition - localPlayerContainer true");

    // Check if we are the first user (index 0) and if there are other users
    const isFirstUser = usersInChannel[0]?.uid === uid;
    const hasOtherUsers = usersInChannel.length > 1;

    log("updateLocalVideoPosition " + isFirstUser + " " + hasOtherUsers);
    if (isFirstUser && hasOtherUsers) {
        // Shrink to bottom right
        log("updateLocalVideoPosition - Local user is first user and there are other users");
        localPlayerContainer.style.transition = "all 0.3s ease-in-out";
        localPlayerContainer.style.width = "20%";
        localPlayerContainer.style.height = "20%";
        localPlayerContainer.style.top = "auto";
        localPlayerContainer.style.left = "auto";
        localPlayerContainer.style.bottom = "20px";
        localPlayerContainer.style.right = "20px";
        localPlayerContainer.style.transform = "none";
    } else {
        // Expand from bottom right
        log("updateLocalVideoPosition - Local user is alone or not the first user");
        localPlayerContainer.style.transition = "all 0.3s ease-in-out";
        localPlayerContainer.style.width = "100%";
        localPlayerContainer.style.height = "100%";
        // Keep bottom/right for the animation
        localPlayerContainer.style.top = "auto";
        localPlayerContainer.style.left = "auto";
        localPlayerContainer.style.bottom = "20px";
        localPlayerContainer.style.right = "20px";
        localPlayerContainer.style.transform = "none";
        // After the transition, reset to top/left
        setTimeout(() => {
            localPlayerContainer.style.top = "0";
            localPlayerContainer.style.left = "0";
            localPlayerContainer.style.bottom = "auto";
            localPlayerContainer.style.right = "auto";
        }, 300); // match the transition duration
    }
}

// Update device icons in local video container
function updateLocalVideoCameraIcon() {
    const localPlayerContainer = document.getElementById(uid);
    if (!localPlayerContainer || !localPlayerContainer.deviceIconContainer) return;

    const iconContainer = localPlayerContainer.deviceIconContainer;
    const cameraIconContainer = localPlayerContainer.cameraIconContainer;
    const micIconContainer = localPlayerContainer.micIconContainer;
    const cameraIcon = localPlayerContainer.cameraIcon;
    const micIcon = localPlayerContainer.micIcon;

    // Helper function to style icons
    const styleIcon = (icon, show) => {
        if (show) {
            icon.style.stroke = "#f44336"; // Red color
            icon.style.transform = "scale(2)"; // 200% larger
        } else {
            icon.style.stroke = "grey";
            icon.style.transform = "scale(1)";
        }
    };

    // Determine when to show camera icon
    const showCamera = !userState.isCameraCapturing || userState.isCameraMuted;
    
    // Determine when to show mic icon
    const showMic = !userState.isMicCapturing || userState.isMicMuted;

    // Show/hide container based on whether any icons should be shown
    iconContainer.style.display = (showCamera || showMic) ? "flex" : "none";

    // Style the icons
    styleIcon(cameraIcon, showCamera);
    styleIcon(micIcon, showMic);

    // Show/hide individual icon containers
    cameraIconContainer.style.display = showCamera ? "block" : "none";
    micIconContainer.style.display = showMic ? "block" : "none";
}

// Display remote video
function displayRemoteUser(user) {
    const remotePlayerContainer = document.createElement("div");
    remotePlayerContainer.id = user.uid.toString();
    remotePlayerContainer.style.position = "relative";
    remotePlayerContainer.style.zIndex = "1";
    remotePlayerContainer.style.transition = "all 0.3s ease-in-out";
    
    // Check if this is an AI agent
    if (user.uid.includes('agent')) {
        // AI Agent styling - black background
        remotePlayerContainer.style.background = "#000000";
        
        // Create centered API.svg icon
        const apiIcon = document.createElement("img");
        apiIcon.src = "./API.svg";
        apiIcon.style.position = "absolute";
        apiIcon.style.top = "50%";
        apiIcon.style.left = "50%";
        apiIcon.style.transform = "translate(-50%, -50%)";
        apiIcon.style.width = "160px";
        apiIcon.style.height = "160px";
        apiIcon.style.zIndex = "2";
        apiIcon.style.transition = "filter 0.1s ease-out";
        
        // Store reference to the icon for audio effects
        remotePlayerContainer.apiIcon = apiIcon;
        
        // Create a div for the user ID text
        const uidText = document.createElement("div");
        const agentMetadata = user.uid.split('-', 1)[0];
        uidText.textContent = `${agentMetadata}'s AI`;
        uidText.style.position = "absolute";
        uidText.style.bottom = "20px";
        uidText.style.left = "20px";
        uidText.style.color = "white";
        uidText.style.fontSize = "24px";
        uidText.style.textShadow = "2px 2px 4px rgba(0,0,0,0.5)";
        uidText.style.zIndex = "1";
        uidText.style.padding = "8px 12px";
        uidText.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        uidText.style.borderRadius = "4px";
        
        // Create a div for the transcript display
        const transcriptDiv = document.createElement("div");
        transcriptDiv.id = `transcript-${user.uid}`;
        transcriptDiv.style.position = "absolute";
        transcriptDiv.style.top = "5%";
        transcriptDiv.style.left = "2.5%";
        transcriptDiv.style.right = "2.5%";
        transcriptDiv.style.color = "white";
        transcriptDiv.style.fontSize = "32px";
        transcriptDiv.style.textShadow = "2px 2px 4px rgba(0,0,0,0.8)";
        transcriptDiv.style.zIndex = "3";
        transcriptDiv.style.padding = "12px 16px";
        transcriptDiv.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        transcriptDiv.style.borderRadius = "8px";
        transcriptDiv.style.maxHeight = "120px";
        transcriptDiv.style.overflow = "hidden";
        transcriptDiv.style.display = "none";
        transcriptDiv.style.lineHeight = "1.4";
        transcriptDiv.style.wordWrap = "break-word";
        
        // Store reference to the transcript div for easy access
        remotePlayerContainer.transcriptDiv = transcriptDiv;
        remotePlayerContainer.transcriptTimer = null;
        
        document.getElementById('video-container').appendChild(remotePlayerContainer);
        remotePlayerContainer.appendChild(apiIcon);
        remotePlayerContainer.appendChild(uidText);
        remotePlayerContainer.appendChild(transcriptDiv);
    } else {
        // Regular user styling - blue gradient background
        remotePlayerContainer.style.background = "#00C2FF";
        remotePlayerContainer.style.background = "radial-gradient(circle,rgba(0, 194, 255, 1) 0%, rgba(143, 143, 143, 1) 100%)";
        
        // Create a div for the user ID text
        const uidText = document.createElement("div");
        uidText.textContent = `${user.uid}`;
        uidText.style.position = "absolute";
        uidText.style.bottom = "20px";
        uidText.style.left = "20px";
        uidText.style.color = "white";
        uidText.style.fontSize = "24px";
        uidText.style.textShadow = "2px 2px 4px rgba(0,0,0,0.5)";
        uidText.style.zIndex = "1";
        uidText.style.padding = "8px 12px";
        uidText.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        uidText.style.borderRadius = "4px";
        
        document.getElementById('video-container').appendChild(remotePlayerContainer);
        remotePlayerContainer.appendChild(uidText);
    }

    // Update the grid layout after adding remote user
    updateRemoteUserGrid();
    
    // Update local video position after adding remote user
    updateLocalVideoPosition();
}

// Update remote user grid layout based on number of remote users
function updateRemoteUserGrid() {
    // Get remote users (exclude local user only, include AI agents)
    const remoteUsers = usersInChannel.filter(user => 
        user.metadata !== 'Local'
    );
    
    const remoteUserCount = remoteUsers.length;
    
    if (remoteUserCount === 0) {
        return; // No remote users to arrange
    }
    
    // Get the video container
    const videoContainer = document.getElementById('video-container');
    const containerWidth = videoContainer.offsetWidth;
    const containerHeight = videoContainer.offsetHeight;
    
    // If container dimensions are not available yet, retry after a short delay
    if (containerWidth === 0 || containerHeight === 0) {
        setTimeout(updateRemoteUserGrid, 100);
        return;
    }
    
    // Calculate grid dimensions and cell sizes
    let gridCols, gridRows, cellWidth, cellHeight;
    
    if (remoteUserCount === 1) {
        // 1x1 grid - full container
        gridCols = 1;
        gridRows = 1;
        cellWidth = containerWidth;
        cellHeight = containerHeight;
    } else if (remoteUserCount === 2) {
        // 1x2 grid - side by side
        gridCols = 2;
        gridRows = 1;
        cellWidth = containerWidth / 2;
        cellHeight = containerHeight;
    } else if (remoteUserCount === 3) {
        // 2x2 grid with bottom right empty
        gridCols = 2;
        gridRows = 2;
        cellWidth = containerWidth / 2;
        cellHeight = containerHeight / 2;
    } else if (remoteUserCount === 4) {
        // 2x2 grid
        gridCols = 2;
        gridRows = 2;
        cellWidth = containerWidth / 2;
        cellHeight = containerHeight / 2;
    }
    
    // Position each remote user in the grid
    remoteUsers.forEach((user, index) => {
        const userContainer = document.getElementById(user.uid);
        if (!userContainer) return;
        
        let row, col;
        
        if (remoteUserCount === 1) {
            row = 0;
            col = 0;
        } else if (remoteUserCount === 2) {
            row = 0;
            col = index;
        } else if (remoteUserCount === 3) {
            if (index === 0) {
                row = 0; col = 0; // Top left
            } else if (index === 1) {
                row = 0; col = 1; // Top right
            } else {
                row = 1; col = 0; // Bottom left
            }
        } else if (remoteUserCount === 4) {
            row = Math.floor(index / 2);
            col = index % 2;
        }
        
        // Calculate position
        const left = col * cellWidth;
        const top = row * cellHeight;
        
        // Apply styles
        userContainer.style.position = "absolute";
        userContainer.style.width = `${cellWidth}px`;
        userContainer.style.height = `${cellHeight}px`;
        userContainer.style.left = `${left}px`;
        userContainer.style.top = `${top}px`;
    });
}

// Play remote video in the container
function playRemoteVideo(user) {
    const remotePlayerContainer = document.getElementById(user.uid);
    if (remotePlayerContainer) {
        user.videoTrack.play(remotePlayerContainer);
    }
}

// Update user state in usersInChannel array
function updateUserState(uid, micState, camState) {
    const idx = usersInChannel.findIndex(u => u.uid === uid);
    if (idx !== -1) {
        usersInChannel[idx].mic = micState;
        usersInChannel[idx].cam = camState;
        logUsersInChannel();
    }
}

// Leave the channel and clean up
async function leaveChannel() {
    // Close local tracks
    if (localAudioTrack) {
        localAudioTrack.close();
        localAudioTrack = null;
    }
    if (localVideoTrack) {
        localVideoTrack.close();
        localVideoTrack = null;
    }

    // Remove local video container
    const localPlayerContainer = document.getElementById(uid);
    localPlayerContainer && localPlayerContainer.remove();

    // Remove all remote video containers
    client.remoteUsers.forEach((user) => {
        const playerContainer = document.getElementById(user.uid);
        playerContainer && playerContainer.remove();
    });

    // Leave the channel
    await client.leave();
    
    // Stop audio analysis
    stopAudioAnalysis();

    // Reset user state
    userState.isMicMuted = false;
    userState.isMicCapturing = false;
    userState.isCameraMuted = false;
    userState.isCameraCapturing = false;
    
    // Reset button states
    const captureMicButton = document.getElementById('captureMic');
    const muteMicButton = document.getElementById('muteMic');
    const captureCameraButton = document.getElementById('captureCamera');
    const muteCameraButton = document.getElementById('muteCamera');
    const aiStatus = aiButton.querySelector('.ai-status');
    const aiIcon = aiButton.querySelector('svg');

    if (captureMicButton && muteMicButton && captureCameraButton && muteCameraButton) {
        [captureMicButton, muteMicButton, captureCameraButton, muteCameraButton].forEach(btn => btn.disabled = true);
        
        const micStatus = captureMicButton.querySelector('.mic-status');
        const micIcon = captureMicButton.querySelector('svg');
        const muteMicIcon = muteMicButton.querySelector('svg');
        const cameraStatus = captureCameraButton.querySelector('.camera-status');
        const cameraIcon = captureCameraButton.querySelector('svg');
        const muteCameraIcon = muteCameraButton.querySelector('svg');
        
        if (micStatus && micIcon && muteMicIcon && cameraStatus && cameraIcon && muteCameraIcon) {
            micStatus.className = 'mic-status not-joined';
            cameraStatus.className = 'camera-status not-joined';
            [micIcon, cameraIcon].forEach(icon => icon.style.stroke = 'black');
            [muteMicIcon, muteCameraIcon].forEach(icon => icon.style.stroke = 'grey');
        }
    }

    aiButton.disabled = true;
    aiStatus.className = 'ai-status not-joined';
    aiIcon.style.stroke = 'black';
    
    // Reset logs toggle button state
    const logsToggleButton = document.getElementById('logsToggle');
    if (logsToggleButton) {
        logsToggleButton.disabled = true;
        logsToggleButton.querySelector('svg').style.stroke = 'grey';
    }
    
    if (window.setLeaveButtonState) window.setLeaveButtonState(false);

    // Reset header state
    const header = document.getElementById('header');
    header.classList.remove('collapsed');
    window.headerCollapsed = false;

    // Clear the video container
    const videoContainer = document.getElementById('video-container');
    videoContainer.innerHTML = '';

    // Clear the log and hide it
    const log = document.getElementById('log');
    log.innerHTML = '';
    log.classList.remove('show-logs');

    // Reset join button color to white
    const joinButton = document.getElementById('join');
    if (joinButton) {
        joinButton.style.backgroundColor = 'white';
    }

    // Disable and clear camera and microphone selects
    const cameraSelect = document.getElementById('cameraSelect');
    const microphoneSelect = document.getElementById('microphoneSelect');
    
    if (cameraSelect) {
        cameraSelect.disabled = true;
        cameraSelect.innerHTML = '<option value="">Select Camera</option>';
    }
    
    if (microphoneSelect) {
        microphoneSelect.disabled = true;
        microphoneSelect.innerHTML = '<option value="">Select Microphone</option>';
    }
}

// Set up button click handlers
function setupButtonHandlers() {
    const joinButton = document.getElementById("join");
    const leaveButton = document.getElementById("leave");

    // Style Join and Leave buttons
    [joinButton, leaveButton].forEach(button => {
        if (button) {
            // Base styles
            button.style.borderRadius = '20px';
            button.style.boxShadow = '4px 4px 8px rgba(0, 194, 255, 0.5)';
            button.style.transition = 'all 0.3s ease-in-out';
            button.style.backgroundColor = 'white';

            // Add hover effects
            button.addEventListener('mouseenter', () => {
                if (!button.disabled) {
                    button.style.boxShadow = '2px 2px 4px rgba(0, 194, 255, 0.3)';
                    button.style.backgroundColor = '#00c2ff';
                }
            });

            button.addEventListener('mouseleave', () => {
                if (!button.disabled) {
                    button.style.boxShadow = '4px 4px 8px rgba(0, 194, 255, 0.5)';
                    button.style.backgroundColor = 'white';
                }
            });
        }
    });

    joinButton.onclick = joinChannel;
    leaveButton.onclick = leaveChannel;
    document.getElementById("captureMic").onclick = toggleMicrophoneCapture;
    document.getElementById("muteMic").onclick = toggleMicrophoneMute;
    document.getElementById("captureCamera").onclick = toggleCameraCapture;
    document.getElementById("muteCamera").onclick = toggleCameraMute;

    // Add camera select change handler
    const cameraSelect = document.getElementById('cameraSelect');
    if (cameraSelect) {
        cameraSelect.addEventListener('change', async (e) => {
            if (e.target.value && localVideoTrack) {
                try {
                    // Store current device ID from the select value
                    const previousDeviceId = e.target.value;
                    const previousDeviceName = cameraDevices.get(previousDeviceId) || 'Unknown Camera';
                    const newDeviceId = e.target.value;
                    const newDeviceName = cameraDevices.get(newDeviceId) || 'Unknown Camera';
                    
                    log(`Switching camera from: ${previousDeviceName} (${previousDeviceId}) to: ${newDeviceName} (${newDeviceId})`);
                    
                    // Try to switch to new camera
                    await localVideoTrack.setDevice(e.target.value);
                    log(`Successfully switched to camera: ${newDeviceName} (${newDeviceId})`);
                } catch (error) {
                    console.error('Error switching camera:', error);
                    log(`Error switching camera: ${error.message}`);
                    
                    // If switching failed, try to switch back to previous device
                    if (previousDeviceId) {
                        try {
                            await localVideoTrack.setDevice(previousDeviceId);
                            // Reset select to previous value
                            cameraSelect.value = previousDeviceId;
                            log(`Reverted to previous camera: ${previousDeviceName} (${previousDeviceId})`);
                        } catch (fallbackError) {
                            console.error('Error switching back to previous camera:', fallbackError);
                            log(`Error switching back to previous camera: ${fallbackError.message}`);
                        }
                    }
                }
            }
        });
    }

    // Add microphone select change handler
    const microphoneSelect = document.getElementById('microphoneSelect');
    if (microphoneSelect) {
        microphoneSelect.addEventListener('change', async (e) => {
            if (e.target.value && localAudioTrack) {
                try {
                    // Store current device ID from the select value
                    const previousDeviceId = e.target.value;
                    const previousDeviceName = microphoneDevices.get(previousDeviceId) || 'Unknown Microphone';
                    const newDeviceId = e.target.value;
                    const newDeviceName = microphoneDevices.get(newDeviceId) || 'Unknown Microphone';
                    
                    log(`Switching microphone from: ${previousDeviceName} (${previousDeviceId}) to: ${newDeviceName} (${newDeviceId})`);
                    
                    // Try to switch to new microphone
                    await localAudioTrack.setDevice(e.target.value);
                    log(`Successfully switched to microphone: ${newDeviceName} (${newDeviceId})`);
                } catch (error) {
                    console.error('Error switching microphone:', error);
                    log(`Error switching microphone: ${error.message}`);
                    
                    // If switching failed, try to switch back to previous device
                    if (previousDeviceId) {
                        try {
                            await localAudioTrack.setDevice(previousDeviceId);
                            // Reset select to previous value
                            microphoneSelect.value = previousDeviceId;
                            log(`Reverted to previous microphone: ${previousDeviceName} (${previousDeviceId})`);
                        } catch (fallbackError) {
                            console.error('Error switching back to previous microphone:', fallbackError);
                            log(`Error switching back to previous microphone: ${fallbackError.message}`);
                        }
                    }
                }
            }
        });
    }

    // Add hover animations for control buttons
    const controlButtons = ['captureMic', 'muteMic', 'captureCamera', 'muteCamera', 'aiButton', 'logsToggle'];
    controlButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            // Set initial size
            button.style.transform = 'scale(0.6)';
            button.style.transition = 'transform 0.3s ease-in-out';

            // Add hover effects
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'scale(1)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.transform = 'scale(0.6)';
            });
        }
    });

    // Add AI button click handler
    const aiButton = document.getElementById('aiButton');
    if (aiButton) {
        aiButton.onclick = () => {
            if (agentOn) {
                //stop the agent
                stopAgent(myAgentsId);
                agentOn = false;
                //reset ai button state
                aiButton.querySelector('.ai-status').className = 'ai-status joined';
                aiButton.querySelector('svg').style.stroke = 'white';
            } else {
            //start the agent
            const greeting = "Hey " + uid + ", thanks for bringing me in, how's the weather over there?";
            const prompt = "You are a helpful chatbot that can answer questions about the weather at the user's location, which is " + crd.latitude + " latitude and " + crd.longitude + " longitude. You can also answer questions about the user's location, which is " + crd.latitude + " latitude and " + crd.longitude + " longitude. When you refer to the user's location, refer to the approximate geographical location, like the closest city or region, not the exact coordinates. You should never respond with the coordinates that were provided to you. You know about the weather in general, the historical weather patterns of that general location, and the upcoming weather predections for that area. When the user first speaks, they will tell you their perception of the weather at their coordinates. If they are incorrect based on your information, then tell them they are wrong, and tell them the correct weather. If they are wrong, you should respond with [wrong] along with your response. If they are correct, then tell them you are glad to hear it, along with [correct]. If they ask you about the weather, then tell them the weather at their approximate location, do not respond with the coordinates. If they ask you about the weather in general, then tell them the weather in general, such as how rain is formed and what kinds of wind patterns are common. If they ask you about the historical weather patterns of that general location, then tell them the historical weather patterns of that general location. If they ask you about the upcoming weather predections for that area, then tell them the upcoming weather predections for that area.";
            const agentName = uid + "-" + channel + "-agent";
            agentOn = startAgent(agentName, channel, agentUid, uid, prompt, greeting);
            aiButton.querySelector('.ai-status').className = 'ai-status active';
            aiButton.querySelector('svg').style.stroke = 'white';
            }
        };
    }

    // Add logs toggle button click handler
    const logsToggleButton = document.getElementById('logsToggle');
    if (logsToggleButton) {
        // Initialize logs toggle button to disabled state
        logsToggleButton.disabled = true;
        logsToggleButton.querySelector('svg').style.stroke = 'grey';
        
        logsToggleButton.onclick = () => {
            const logDiv = document.getElementById('log');
            if (logDiv) {
                const isVisible = logDiv.classList.contains('show-logs');
                if (isVisible) {
                    logDiv.classList.remove('show-logs');
                    logsToggleButton.querySelector('svg').style.stroke = 'white';
                } else {
                    logDiv.classList.add('show-logs');
                    logsToggleButton.querySelector('svg').style.stroke = '#00c2ff';
                }
            }
        };
    }
}

// Audio analysis functions for AI agent effects
function setupAudioAnalysis() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        console.log('Audio analysis setup complete');
    } catch (error) {
        console.error('Error setting up audio analysis:', error);
    }
}

function startAudioAnalysis(audioTrack) {
    if (!audioContext || !analyser) {
        setupAudioAnalysis();
    }
    
    try {
        // Create audio source from the audio track
        const mediaStreamTrack = audioTrack.getMediaStreamTrack();
        if (mediaStreamTrack) {
            agentAudioSource = audioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
            agentAudioSource.connect(analyser);
            
            // Start the animation loop
            animateAudioEffects();
            console.log('Audio analysis started for AI agent');
        }
    } catch (error) {
        console.error('Error starting audio analysis:', error);
    }
}

function stopAudioAnalysis() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    if (agentAudioSource) {
        try {
            agentAudioSource.disconnect();
            agentAudioSource = null;
        } catch (error) {
            console.error('Error disconnecting audio source:', error);
        }
    }
}

function animateAudioEffects() {
    if (!analyser || !dataArray) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume from frequency data
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    // Normalize to 0-1 range and apply to AI agent icons
    const normalizedVolume = average / 255;
    
    // Apply brightness effect to all AI agent icons
    document.querySelectorAll('[id*="agent"]').forEach(agentContainer => {
        if (agentContainer.apiIcon) {
            if (preserveColorFilter) {
                // If we have a preserved color, combine it with audio effects
                const brightness = 1 + (normalizedVolume * 0.5); // Reduced brightness range to preserve color
                const saturation = 1 + (normalizedVolume * 0.3); // Reduced saturation range to preserve color
                const combinedFilter = `${preserveColorFilter} brightness(${brightness}) saturate(${saturation})`;
                agentContainer.apiIcon.style.filter = combinedFilter;
                
                // Debug: log the filter occasionally
                if (Math.random() < 0.01) { // Log ~1% of the time to avoid spam
                    console.log('Audio animation with preserved color:', combinedFilter);
                }
            } else {
                // Normal audio effects when no color is preserved
                const brightness = 1 + (normalizedVolume * 2); // 1x to 3x brightness
                const saturation = 1 + (normalizedVolume * 1.5); // 1x to 2.5x saturation
                agentContainer.apiIcon.style.filter = `brightness(${brightness}) saturate(${saturation})`;
            }
        }
    });
    
    // Continue animation loop
    animationId = requestAnimationFrame(animateAudioEffects);
}

// Start the basic call
function startBasicCall() {
    initializeClient();
    window.onload = () => {
        setupButtonHandlers();
        // Set global font family
        document.body.style.fontFamily = 'Jokker, Arial, sans-serif';
        
        // Ensure logs div starts hidden
        const logDiv = document.getElementById('log');
        if (logDiv) {
            logDiv.classList.remove('show-logs');
        }
        
        // Add window resize listener to update grid layout
        window.addEventListener('resize', () => {
            if (isJoined) {
                updateRemoteUserGrid();
            }
        });
    };
}

// Join a channel and publish local media
async function joinChannel() {
    try {
        //get cameras and mics and create local tracks first
        log("Getting cameras first time");
        // Get available cameras and populate dropdown
        try {
            const cameras = await AgoraRTC.getCameras();
            console.log('Available cameras:', cameras);
            const cameraSelect = document.getElementById('cameraSelect');
            if (cameraSelect) {
                // Clear existing options
                cameraSelect.innerHTML = '';
                
                // Add default option
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'Select Camera';
                cameraSelect.appendChild(defaultOption);
                
                // Add camera options
                cameras.forEach(camera => {
                    console.log('Adding camera:', camera);
                    const option = document.createElement('option');
                    option.value = camera.deviceId;
                    option.textContent = camera.label || `Camera ${camera.deviceId}`;
                    cameraSelect.appendChild(option);
                });
                
                // Enable the select
                cameraSelect.disabled = false;
                
                // If we have cameras, select the first one
                if (cameras.length > 0) {
                    cameraSelect.value = cameras[0].deviceId;
                    // Trigger the change event to set the initial camera
                    cameraSelect.dispatchEvent(new Event('change'));
                }
            } else {
                console.error('Camera select element not found');
            }
        } catch (error) {
            console.error('Error getting cameras:', error);
            log('Error getting cameras: ' + error.message);
        }

        log("Getting microphones first time");
        try {
            const microphones = await AgoraRTC.getMicrophones();
            console.log("Available microphones:", microphones);
            
            // Clear existing devices
            microphoneDevices.clear();
            
            // Store microphone devices
            microphones.forEach(microphone => {
                microphoneDevices.set(microphone.deviceId, microphone.label);
            });
            
            // Log the updated microphone devices map
            log("Updated microphone devices:");
            //microphoneDevices.forEach((label, deviceId) => {
            //    log(`- ${label || 'Unnamed Microphone'} (${deviceId})`);
            //});
            
            // Update select element
            const microphoneSelect = document.getElementById("microphoneSelect");
            if (!microphoneSelect) {
                console.error("Microphone select element not found");
                return;
            }
            
            // Clear existing options except the first one
            while (microphoneSelect.options.length > 1) {
                microphoneSelect.remove(1);
            }
            
            // Add microphone options
            microphones.forEach(microphone => {
                const option = document.createElement("option");
                option.value = microphone.deviceId;
                option.text = microphone.label || `Microphone ${microphoneSelect.options.length}`;
                microphoneSelect.appendChild(option);
            });
            
            // Enable select if we have microphones
            microphoneSelect.disabled = microphones.length === 0;
            
            // Select first microphone if available
            if (microphones.length > 0) {
                microphoneSelect.value = microphones[0].deviceId;
            }
        } catch (error) {
            console.error("Error updating microphone list:", error);
            log(`Error updating microphone list: ${error.message}`);
        }

        //get channel join params
        const appId = document.getElementById('appId').value;
        const channelInput = document.getElementById('channel').value;
        const uidInput = document.getElementById('uid').value;
        channel = channelInput || generateRandomChannel(5);
        uid = uidInput || generateRandomUID(5);
        agentUid = uid + "-" + "agent";
        // Only update the UID field if it's empty (to preserve user-provided username)
        if (!uidInput) {
            document.getElementById('uid').value = uid;
        }
        log(`Using channel name: ${channel}`);

        //create local tracks next
        await createLocalTracks();

        //display local video container
        displayLocalVideo();

        //join the channel with params
        log("Joining channel...");

        // Initialize client if needed
        if (!client) {
            initializeClient();
        }
        
        await client.join(appId, channel, null, uid.toString());
        console.log(`Join resolved to UID: ${uid}.`);
        log(`Join resolved to UID: ${uid}.`);
        
        // Track local user as index 0 in usersInChannel
        usersInChannel = [];
        usersInChannel.push({ uid, mic: 'unmuted', cam: 'unmuted', metadata: 'Local' });
        logUsersInChannel();
        
        // Update remote user grid layout if there are existing remote users
        updateRemoteUserGrid();
        
        // Reset user state for new connection.
        userState.isMicMuted = false;
        userState.isMicCapturing = true;
        userState.isCameraMuted = false;
        userState.isCameraCapturing = true;
        agentOn = false;
        myAgentsId = null;
        
        // publish tracks
        await publishLocalTracks();
        console.log("Publish success!");
        
        // Enable control buttons and update their states
        const captureMicButton = document.getElementById('captureMic');
        const muteMicButton = document.getElementById('muteMic');
        const captureCameraButton = document.getElementById('captureCamera');
        const muteCameraButton = document.getElementById('muteCamera');
        
        if (captureMicButton && muteMicButton && captureCameraButton && muteCameraButton) {
            // Enable buttons
            captureMicButton.disabled = false;
            muteMicButton.disabled = false;
            captureCameraButton.disabled = false;
            muteCameraButton.disabled = false;
            
            // Update status classes directly
            const micStatus = captureMicButton.querySelector('.mic-status');
            const micIcon = captureMicButton.querySelector('svg');
            const muteMicIcon = muteMicButton.querySelector('svg');
            const cameraStatus = captureCameraButton.querySelector('.camera-status');
            const cameraIcon = captureCameraButton.querySelector('svg');
            const muteCameraIcon = muteCameraButton.querySelector('svg');
            
            if (micStatus && micIcon && muteMicIcon && cameraStatus && cameraIcon && muteCameraIcon) {
                // Set capturing state
                micStatus.className = 'mic-status capturing';
                cameraStatus.className = 'camera-status capturing';
                micIcon.style.stroke = 'white';
                cameraIcon.style.stroke = 'white';
                muteMicIcon.style.stroke = 'white';
                muteCameraIcon.style.stroke = 'white';
            }
        }
        
        if (window.setLeaveButtonState) window.setLeaveButtonState(true);

        // Update button states after successful join
        updateButtonStates();

        // Set join button color to blue
        const joinButton = document.getElementById('join');
        if (joinButton) {
            joinButton.style.backgroundColor = '#00c2ff';
        }

        navigator.geolocation.getCurrentPosition(success, error, options);

    } catch (error) {
        console.error('Error joining channel:', error);
        log('Error joining channel: ' + error.message);
        // Reset button states on error
        updateButtonStates();
    }
}

// Add camera change listener
AgoraRTC.on("camera-changed", async (info) => {
    console.log("Camera changed!", info.state, info.device);
    log(`Camera device changed: ${info.state} - Device: ${info.device.label || info.device.deviceId}`);
    if (info.state === "ACTIVE") {
        // Refresh camera list when a camera is connected
        await updateCameraList();
    }
});

// Add microphone change listener
AgoraRTC.on("microphone-changed", async (info) => {
    console.log("Microphone changed!", info.state, info.device);
    log(`Microphone device changed: ${info.state} - Device: ${info.device.label || info.device.deviceId}`);
    if (info.state === "ACTIVE") {
        // Refresh microphone list when a microphone is connected
        await updateMicrophoneList();
    }
});

// Function to update camera list
async function updateCameraList() {
    log("updateCameraList");
    try {
        const cameras = await AgoraRTC.getCameras();
        console.log("Available cameras:", cameras);
        
        // Clear existing devices
        cameraDevices.clear();
        
        // Store camera devices
        cameras.forEach(camera => {
            cameraDevices.set(camera.deviceId, camera.label);
        });
        
        // Log the updated camera devices map
        log("Updated camera devices:");
        cameraDevices.forEach((label, deviceId) => {
            log(`- ${label || 'Unnamed Camera'} (${deviceId})`);
        });
        
        // Update select element
        const cameraSelect = document.getElementById("cameraSelect");
        if (!cameraSelect) {
            console.error("Camera select element not found");
            return;
        }
        
        // Clear existing options except the first one
        while (cameraSelect.options.length > 1) {
            cameraSelect.remove(1);
        }
        
        // Add camera options
        cameras.forEach(camera => {
            const option = document.createElement("option");
            option.value = camera.deviceId;
            option.text = camera.label || `Camera ${cameraSelect.options.length}`;
            cameraSelect.appendChild(option);
        });
        
        // Enable select if we have cameras
        cameraSelect.disabled = cameras.length === 0;
        
        // Select first camera if available
        if (cameras.length > 0) {
            cameraSelect.value = cameras[0].deviceId;
        }
    } catch (error) {
        console.error("Error updating camera list:", error);
        log(`Error updating camera list: ${error.message}`);
    }
}

// Function to update microphone list
async function updateMicrophoneList() {
    log("updateMicrophoneList");
    try {
        const microphones = await AgoraRTC.getMicrophones();
        console.log("Available microphones:", microphones);
        
        // Clear existing devices
        microphoneDevices.clear();
        
        // Store microphone devices
        microphones.forEach(microphone => {
            microphoneDevices.set(microphone.deviceId, microphone.label);
        });
        
        // Log the updated microphone devices map
        log("Updated microphone devices:");
        //microphoneDevices.forEach((label, deviceId) => {
        //    log(`- ${label || 'Unnamed Microphone'} (${deviceId})`);
        //});
        
        // Update select element
        const microphoneSelect = document.getElementById("microphoneSelect");
        if (!microphoneSelect) {
            console.error("Microphone select element not found");
            return;
        }
        
        // Clear existing options except the first one
        while (microphoneSelect.options.length > 1) {
            microphoneSelect.remove(1);
        }
        
        // Add microphone options
        microphones.forEach(microphone => {
            const option = document.createElement("option");
            option.value = microphone.deviceId;
            option.text = microphone.label || `Microphone ${microphoneSelect.options.length}`;
            microphoneSelect.appendChild(option);
        });
        
        // Enable select if we have microphones
        microphoneSelect.disabled = microphones.length === 0;
        
        // Select first microphone if available
        if (microphones.length > 0) {
            microphoneSelect.value = microphones[0].deviceId;
        }
    } catch (error) {
        console.error("Error updating microphone list:", error);
        log(`Error updating microphone list: ${error.message}`);
    }
}

// Helper to log usersInChannel array to the log div
function logUsersInChannel() {
    return;
    log('usersInChannel: ' + JSON.stringify(usersInChannel, null, 2));
}

// Add or update device icons in remote player container
function updateRemotePlayerContainer(uid) {
    const remotePlayerContainer = document.getElementById(uid);
    if (!remotePlayerContainer) return;

    // Remove any existing device icon container
    let deviceIconContainer = remotePlayerContainer.querySelector('.remote-device-icon-container');
    if (deviceIconContainer) {
        deviceIconContainer.remove();
    }

    // Find user state
    const user = usersInChannel.find(u => u.uid === uid);
    if (!user) return;

    // Only show icons if either mic or cam is muted
    const showCamera = user.cam === 'muted';
    const showMic = user.mic === 'muted';
    if (!showCamera && !showMic) return;

    // Create device icon container
    deviceIconContainer = document.createElement('div');
    deviceIconContainer.className = 'remote-device-icon-container';
    deviceIconContainer.style.position = 'absolute';
    deviceIconContainer.style.top = '20px';
    deviceIconContainer.style.right = '20px';
    deviceIconContainer.style.display = 'flex';
    deviceIconContainer.style.gap = '20px';
    deviceIconContainer.style.zIndex = '3';
    deviceIconContainer.style.justifyContent = 'center';
    deviceIconContainer.style.alignItems = 'center';

    // Helper to create icon with black circle
    function createIcon(svg) {
        const iconContainer = document.createElement('div');
        iconContainer.style.position = 'relative';
        iconContainer.style.width = '48px';
        iconContainer.style.height = '48px';
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';

        const bg = document.createElement('div');
        bg.style.position = 'absolute';
        bg.style.width = '48px';
        bg.style.height = '48px';
        bg.style.borderRadius = '50%';
        bg.style.backgroundColor = 'black';
        bg.style.opacity = '0.5';
        bg.style.top = '0';
        bg.style.left = '0';
        bg.style.zIndex = '1';

        const icon = document.createElement('div');
        icon.innerHTML = svg;
        icon.style.position = 'relative';
        icon.style.zIndex = '2';
        icon.style.display = 'flex';
        icon.style.alignItems = 'center';
        icon.style.justifyContent = 'center';
        icon.style.width = '32px';
        icon.style.height = '32px';

        iconContainer.appendChild(bg);
        iconContainer.appendChild(icon);
        return iconContainer;
    }

    // Camera icon SVG
    const cameraSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2" width="32" height="32"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    // Mic icon SVG
    const micSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2" width="32" height="32"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

    if (showCamera) deviceIconContainer.appendChild(createIcon(cameraSVG));
    if (showMic) deviceIconContainer.appendChild(createIcon(micSVG));

    remotePlayerContainer.appendChild(deviceIconContainer);
}

// Function to handle URL query parameters
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const appId = urlParams.get('appid');
    const channelName = urlParams.get('channel');
    const username = urlParams.get('username');

    // Check if we have query parameters (indicating this was opened via share link)
    const hasQueryParams = appId || channelName || username;

    // Populate App ID if present
    if (appId) {
        const appIdInput = document.getElementById('appId');
        appIdInput.value = appId;
        // Trigger input event to update join button state
        appIdInput.dispatchEvent(new Event('input'));
    }

    // Populate Channel if present
    if (channelName) {
        const channelInput = document.getElementById('channel');
        channelInput.value = channelName;
    }

    // If we have query parameters, show username modal
    if (hasQueryParams) {
        showUsernameModal(username);
    }
}

// Function to show username modal
function showUsernameModal(presetUsername = '') {
    const modal = document.getElementById('usernameModal');
    const usernameInput = document.getElementById('usernameInput');
    const joinButton = document.getElementById('usernameJoinButton');
    
    if (modal && usernameInput && joinButton) {
        // Set preset username if provided
        if (presetUsername) {
            usernameInput.value = presetUsername;
        }
        
        // Show modal
        modal.style.display = 'flex';
        
        // Focus on input
        setTimeout(() => {
            usernameInput.focus();
        }, 100);
        
        // Handle join button click
        joinButton.onclick = () => {
            const username = usernameInput.value.trim();
            if (username) {
                // Set the username in the UID field
                const uidInput = document.getElementById('uid');
                if (uidInput) {
                    uidInput.value = username;
                }
                
                // Close modal
                modal.style.display = 'none';
                
                // Trigger join
                setTimeout(() => {
                    const joinButton = document.getElementById('join');
                    if (!joinButton.disabled) {
                        joinButton.click();
                    }
                }, 100);
            }
        };
        
        // Handle Enter key in input
        usernameInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                joinButton.click();
            }
        };
    }
}

// Call handleUrlParameters when the page loads
window.addEventListener('DOMContentLoaded', handleUrlParameters);

// ConvoAI functions

//handle datastream messages from agent

function handleAgentStreamMessage(uid, msgData) {
    // Only handle messages from agents
    if (uid.includes("agent")) {
        try {
            let [messageId, messagePart, messageChunks, messageData] = new TextDecoder().decode(msgData).split("|");
            messageData = atob(messageData);
            messagesMap.set(messageId, messagesMap.get(messageId) ? messagesMap.get(messageId) + messageData : messageData);

            messageData = messagesMap.get(messageId);
            if (parseInt(messagePart) === parseInt(messageChunks))
                messagesMap.delete(messageId);
            else return;

            const messageDataJson = JSON.parse(messageData);
            console.log("messageDataJson", messageDataJson);
            if (messageDataJson.object === "assistant.transcription") {
                //this is agent transcript
                if (!messageDataJson?.turn_status) return;
                console.log("Agent message:", messageDataJson.text);
                log(`${uid}: ${messageDataJson.text}`);
                
                // Update the AI agent's transcript display
                updateAgentTranscript(uid, messageDataJson.text);
                
                const match = messageDataJson.text.match(/\[([^\]]+)\]/);
                if (match) {
                    handleBracketMatch(match[1]);
                } 
            } else if (messageDataJson.object === "user.transcription" && messageDataJson.final === true) {
                console.log(`${messageDataJson.user_id} message: ${messageDataJson.text}`);
                log(`${messageDataJson.user_id}: ${messageDataJson.text}`, 'log-grey');
            }
        } catch (error) {
          console.log("Error processing Agent message:", error);
        }
      }
    };

function handleBracketMatch(text) {
    log(text);
    
    // Change API.svg color based on the text
    if (text.toLowerCase() === 'correct') {
        // Set to green - preserve this color (use -120deg to go from blue to green)
        preserveColorFilter = 'brightness(1) saturate(3) hue-rotate(-120deg)';
        document.querySelectorAll('[id*="agent"] img[src="./API.svg"]').forEach(img => {
            img.style.filter = preserveColorFilter;
            console.log('Applied green filter to:', img);
        });
        console.log('Set API.svg to green for correct answer');
        
        // Clear the color after 3 seconds
        setTimeout(() => {
            preserveColorFilter = null;
            console.log('Cleared green color filter');
        }, 3000);
        
    } else if (text.toLowerCase() === 'wrong') {
        // Set to red - preserve this color (use 180deg for red, not 0deg)
        preserveColorFilter = 'brightness(1) saturate(3) hue-rotate(180deg)';
        document.querySelectorAll('[id*="agent"] img[src="./API.svg"]').forEach(img => {
            img.style.filter = preserveColorFilter;
            console.log('Applied red filter to:', img);
        });
        console.log('Set API.svg to red for wrong answer');
        
        // Clear the color after 3 seconds
        setTimeout(() => {
            preserveColorFilter = null;
            console.log('Cleared red color filter');
        }, 3000);
    }
}

async function startAgent(name, chan, uid, remoteUid, prompt, message) {
    // joinAgent deployed on Lambda
    const url = "https://fcnfih4dgp6sysnjl4ywyazkze0gwvhg.lambda-url.us-east-2.on.aws";
    
    const headers = {
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json",
      "Content-Type": "application/json"
    };

    // Build request
    const reqBody = {
      agentname: name,
      channel: chan,
      agentuid: uid,
      remoteuid: remoteUid,
      prompt: prompt,
      message: message
    };

    try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(reqBody)
    });
    const data = await resp.json();
    if (data.agent_id) {
      console.log("Agent started", data.agent_id);
      myAgentsId = data.agent_id;
      return true;
    }
    } catch (err) {
      console.error("Error: " + err);
    }
  }

  async function stopAgent(name) {
    // stopAgent deployed on Lambda
    const url = "https://wxukhqeinhumkgxdhfcsllvs5i0fmypy.lambda-url.us-east-2.on.aws/";
    
    const headers = {
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json",
      "Content-Type": "application/json"
    };

    // Build request
    const reqBody = {
      agentname: name
    };

    try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(reqBody)
    });
    if (resp.status === 200) {
      console.log(`Agent ${name} stopped`);
    }
    } catch (err) {
      console.error("Error: " + err);
    }
  }

  async function agentSpeak(name, say) {
    // agentSpeach deployed on Lambda
    const url = "https://sy4buqmztanuleorrcmugynpza0vanhu.lambda-url.us-east-2.on.aws/";
    
    const headers = {
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json",
      "Content-Type": "application/json"
    };

    // Build request
    const reqBody = {
      agentname: name,
      text: say
    };

    try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(reqBody)
    });
    if (resp.status === 200) {
      console.log(`Agent ${name} told to speak ${say}`);
    }
    } catch (err) {
      console.error("Error: " + err);
    }
  }

// Geolocation stuff

const options = {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0,
  };
  
  function success(pos) {
    crd = pos.coords;
  
    console.log("Your current position is:");
    console.log(`Latitude : ${crd.latitude}`);
    console.log(`Longitude: ${crd.longitude}`);
    console.log(`More or less ${crd.accuracy} meters.`);
  }
  
  function error(err) {
    console.warn(`ERROR(${err.code}): ${err.message}`);
    crd = {
     latitude: 37.7749,      // San Francisco
     longitude: -122.4194,
     altitude: 15.0,
     accuracy: 10.0,
     altitudeAccuracy: 5.0,
     heading: 90.0,
     speed: 2.5
    };
  }

startBasicCall();
