document.addEventListener('DOMContentLoaded', () => {
  const reportForm = document.getElementById('reportForm');
  const getLocationButton = document.getElementById('getLocation');
  const reportStatus = document.getElementById('reportStatus');
  const latitudeInput = document.getElementById('latitude');
  const longitudeInput = document.getElementById('longitude');
  const openChat = document.getElementById('openChat');
  const chatContainer = document.getElementById('chatContainer');
  const chatLog = document.getElementById('chatLog');
  const chatInput = document.getElementById('chatInput');
  const sendChat = document.getElementById('sendChat');
  const startRecorder = document.getElementById('startRecorder');
  const stopRecorder = document.getElementById('stopRecorder');
  const recordedVideo = document.getElementById('recordedVideo');
  const recordingStatus = document.getElementById('recordingStatus');
  const quickReport = document.getElementById('quickReport');
  const emergencyCall = document.getElementById('emergencyCall');
  const fileSend = document.getElementById('fileSend');
  const fileForm = document.getElementById('fileForm');
  const fileStatus = document.getElementById('fileStatus');
  const brgyInput = document.getElementById('brgyInput');
  const loadBrgyLogs = document.getElementById('loadBrgyLogs');
  const brgyLogs = document.getElementById('brgyLogs');
  let mediaRecorder;
  let recordedChunks = [];
  let currentStream;

  // Toggle sections
  function toggleSection(sectionId) {
    const sections = ['chatSection', 'fileSection', 'reportSection', 'recorderSection', 'brgySection'];
    sections.forEach(id => {
      document.getElementById(id).style.display = id === sectionId ? 'block' : 'none';
    });
  }

  quickReport.addEventListener('click', () => toggleSection('reportSection'));
  openChat.addEventListener('click', () => toggleSection('chatSection'));
  fileSend.addEventListener('click', () => toggleSection('fileSection'));
  startRecorder.addEventListener('click', () => {
    toggleSection('recorderSection');
    startRecording();
  });
  emergencyCall.addEventListener('click', () => {
    window.location.href = 'tel:911'; // Or local emergency number
  });

  async function fetchLocation() {
    if (!navigator.geolocation) {
      reportStatus.textContent = 'GPS is not supported by this browser.';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        latitudeInput.value = position.coords.latitude.toFixed(6);
        longitudeInput.value = position.coords.longitude.toFixed(6);
        reportStatus.textContent = 'GPS coordinates captured successfully.';
      },
      () => {
        reportStatus.textContent = 'Unable to access GPS. Please enable location permissions.';
      }
    );
  }

  getLocationButton.addEventListener('click', fetchLocation);

  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    reportStatus.textContent = 'Sending report...';

    const formData = new FormData(reportForm);
    formData.append('emergencyMode', 'false');
    formData.append('offlineFallback', 'false');

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (result.success) {
        reportStatus.textContent = `Report submitted: Incident ID ${result.incident.id}`;
        reportForm.reset();
        latitudeInput.value = '';
        longitudeInput.value = '';
      } else {
        reportStatus.textContent = 'Failed to submit incident.';
      }
    } catch (error) {
      reportStatus.textContent = 'Network error: unable to reach the server.';
    }
  });

  fileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    fileStatus.textContent = 'Sending files...';

    const formData = new FormData(fileForm);
    formData.append('role', 'Citizen');
    formData.append('brgy', 'Unknown');
    formData.append('incidentType', 'Media Upload');
    formData.append('severity', 'Grey');
    formData.append('emergencyMode', 'false');
    formData.append('offlineFallback', 'false');

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (result.success) {
        fileStatus.textContent = 'Files sent successfully.';
        fileForm.reset();
      } else {
        fileStatus.textContent = 'Failed to send files.';
      }
    } catch (error) {
      fileStatus.textContent = 'Network error.';
    }
  });

  function addChatMessage(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `<strong>${sender}:</strong><div>${message}</div>`;
    chatLog.appendChild(messageElement);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  sendChat.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text) return;
    addChatMessage('You', text);
    chatInput.value = '';
    setTimeout(() => {
      const lower = text.toLowerCase();
      let reply = 'Please describe the emergency or ask for first-aid instructions.';
      if (lower.includes('car crash')) {
        reply = 'Check the airway, breathing, and circulation. Keep the victim still, stop bleeding with clean cloth, and avoid moving the spine unless necessary.';
      } else if (lower.includes('injury') || lower.includes('bleeding')) {
        reply = 'Apply pressure to wounds, elevate injured limbs if no fracture is suspected, and call for help immediately.';
      } else if (lower.includes('fire') || lower.includes('earthquake')) {
        reply = 'Move to a safe open area, avoid hazards, and check other people for injuries once it is safe to do so.';
      } else if (lower.includes('hijack') || lower.includes('theft')) {
        reply = 'Stay calm, prioritize your safety, and activate the emergency shortcut if you can. Report location and incident details as soon as it is safe.';
      }
      addChatMessage('Emergency Chatbot', reply);
    }, 800);
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      currentStream = stream;
      recordedVideo.srcObject = stream;
      mediaRecorder = new MediaRecorder(stream);
      recordedChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        recordedVideo.src = url;
        recordedVideo.srcObject = null;
        recordingStatus.textContent = 'Recording stopped. Video ready.';
        stopRecorder.disabled = true;
        startRecorder.disabled = false;
      };
      mediaRecorder.start();
      recordingStatus.textContent = 'Recording... Click stop when done.';
      stopRecorder.disabled = false;
      startRecorder.disabled = true;
    } catch (error) {
      recordingStatus.textContent = 'Unable to access camera/microphone.';
    }
  }

  stopRecorder.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      currentStream.getTracks().forEach(track => track.stop());
    }
  });

  loadBrgyLogs.addEventListener('click', async () => {
    const brgy = brgyInput.value.trim();
    if (!brgy) return;
    try {
      const response = await fetch(`/api/brgy/${encodeURIComponent(brgy)}/incidents`);
      const incidents = await response.json();
      brgyLogs.innerHTML = incidents.map(inc => `
        <div class="incident-item">
          <strong>${inc.incidentType}</strong><br/>
          ${inc.description}<br/>
          <small>${new Date(inc.reportedAt).toLocaleString()}</small>
        </div>
      `).join('');
    } catch (error) {
      brgyLogs.innerHTML = 'Error loading logs.';
    }
  });
});
