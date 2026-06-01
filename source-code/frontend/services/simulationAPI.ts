// simulationAPI.ts
// API Service for Simulation Management
// COMPLETE VERSION - Supports both sessionId AND simulationId chat routes

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
export const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_URL ||
  API_BASE_URL.replace(/\/api\/v1\/?$/, '');

// ─── Auth Headers ────────────────────────────────────────────────────────────

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
};

// In simulationAPI.ts - REPLACE the handleResponse function with this:

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();

  // ✅ Check if this is a task progress response (has task_index)
  const isTaskProgressResponse = data.data && Array.isArray(data.data) && 
    data.data.length > 0 && (data.data[0]?.task_index !== undefined || data.data[0]?.taskIndex !== undefined);
  
  // ✅ Check if this is a simulation sessions response (has tasks array)
  const isSimulationSessionResponse = data.data && !Array.isArray(data.data) && 
    (data.data.tasks !== undefined || data.data.session_id !== undefined);
  
  console.log('🔍 [handleResponse] Detecting response type:', {
    isTaskProgressResponse,
    isSimulationSessionResponse,
    hasDataArray: !!(data.data && Array.isArray(data.data)),
    firstItemKeys: data.data && Array.isArray(data.data) && data.data[0] ? Object.keys(data.data[0]) : []
  });

  // ✅ For task progress responses - DO NOT modify the status
  if (isTaskProgressResponse) {
    console.log('📊 [handleResponse] Task progress response - keeping original statuses:', 
      data.data.map((item: any) => ({ task_index: item.task_index, status: item.status })));
    return data;
  }

  // ✅ For simulation session responses - DO NOT modify (contains tasks, current_task, etc.)
  if (isSimulationSessionResponse) {
    console.log('📊 [handleResponse] Simulation session response - keeping original data');
    return data;
  }

  // ✅ ONLY for simulation templates (has is_active property)
  if (data.data && Array.isArray(data.data)) {
    // Check if this is a template response (has is_active, not task_index)
    const isTemplateResponse = data.data.length === 0 || data.data[0]?.is_active !== undefined;
    
    if (isTemplateResponse) {
      console.log('📊 [handleResponse] Template response - transforming status based on is_active');
      data.data = data.data.map((item: any) => {
        let frontendStatus = 'inactive';
        
        if (item.is_active === true) {
          frontendStatus = 'active';
        } else {
          frontendStatus = 'inactive';
        }
        
        return {
          ...item,
          status: frontendStatus,
          title: item.name || item.title,
        };
      });
    } else {
      // Unknown array response - don't modify
      console.log('📊 [handleResponse] Unknown array response - keeping original data');
    }
  } else if (
    data.data &&
    !Array.isArray(data.data) &&
    data.data.is_active !== undefined
  ) {
    // Single template response
    console.log('📊 [handleResponse] Single template response - transforming status');
    data.data = {
      ...data.data,
      status: data.data.is_active === true ? 'active' : 'inactive',
      title: data.data.name || data.data.title,
    };
  }

  return data;
};





// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE ROUTES
// ════════════════════════════════════════════════════════════════════════════

export const createSimulationTemplate = async (simulation: any) => {
  const response = await fetch(`${API_BASE_URL}/simulations/templates`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: simulation.title,
      description: simulation.description,
      type: deriveType(simulation.tasks),
      difficulty: simulation.difficulty,
      duration_minutes: simulation.duration,
      tasks: simulation.tasks,
      scoring_rubric: simulation.scoring,
      pass_fail_criteria: simulation.passFailCriteria,
      is_public: false,
      job_id: simulation.jobId,
      objectives: simulation.objectives,
      jobRole: simulation.jobRole,
      settings: simulation.settings,
      practiceEnabled: simulation.practiceEnabled,
      practiceSimulation: simulation.practiceSimulation,
      compliance: simulation.compliance,
      availability: simulation.availability,
    }),
  });
  return handleResponse(response);
};

export const getSuggestions = async (): Promise<{ objectives: string[]; taskTitles: string[] } | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/simulations/suggestions`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch {
    return null;
  }
};

export const saveSimulationDraft = async (simulation: any) => {
  const isValidUUID = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  const isNew = !simulation.id || !isValidUUID(simulation.id);

  if (isNew) {
    const response = await fetch(`${API_BASE_URL}/simulations`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(buildCreatePayload(simulation)),
    });
    return handleResponse(response);
  } else {
    const response = await fetch(`${API_BASE_URL}/simulations/${simulation.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(buildUpdatePayload(simulation)),
    });
    return handleResponse(response);
  }
};

export const publishSimulation = async (simulation: any) => {
  const isValidUUID = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  const hasRealId = simulation.id && isValidUUID(simulation.id);

  if (hasRealId) {
    // 1. Save all latest data first
    await fetch(`${API_BASE_URL}/simulations/${simulation.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(buildFullPayload(simulation, 'draft')),
    });
    // 2. Then publish
    const publishRes = await fetch(`${API_BASE_URL}/simulations/${simulation.id}/publish`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(publishRes);
  } else {
    // New simulation — create directly as published
    const response = await fetch(`${API_BASE_URL}/simulations`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(buildFullPayload(simulation, 'published')),
    });
    return handleResponse(response);
  }
};

export const getSimulationById = async (id: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const duplicateSimulation = async (id: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/${id}/duplicate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const archiveSimulation = async (id: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/${id}/archive`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const deleteSimulation = async (id: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getSimulationTemplates = async (params: Record<string, any> = {}) => {
  const { status: _status, ...cleanParams } = params;
  const qs = new URLSearchParams(cleanParams).toString();
  const response = await fetch(
    `${API_BASE_URL}/simulations/templates${qs ? `?${qs}` : ''}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const getAllSimulations = async (params: Record<string, any> = {}) => {
  const { status: _status, ...cleanParams } = params;
  const qs = new URLSearchParams(cleanParams).toString();
  const response = await fetch(
    `${API_BASE_URL}/simulations${qs ? `?${qs}` : ''}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// CANDIDATE SIMULATION ROUTES (for applied jobs)
// ════════════════════════════════════════════════════════════════════════════

export const getMySimulations = async (
  params: {
    page?: number;
    limit?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
  } = {}
) => {
  const qs = new URLSearchParams();
  if (params.page) qs.append('page', params.page.toString());
  if (params.limit) qs.append('limit', params.limit.toString());
  if (params.status) qs.append('status', params.status);

  const response = await fetch(
    `${API_BASE_URL}/simulations/my-simulations${qs.toString() ? `?${qs}` : ''}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const getMySimulationStats = async () => {
  const response = await fetch(`${API_BASE_URL}/simulations/my-simulations/stats`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getMySimulationById = async (simulationId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/my-simulations/${simulationId}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// In your API service (simulationAPI.ts)
export const resumeMySimulation = async (sessionId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/my-simulations/${sessionId}/resume`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  const result = await handleResponse(response);
  
  // Log to verify githubRepo is present
  console.log('Resume response:', result.data);
  console.log('githubRepo:', result.data?.githubRepo);
  
  return result;
};

export const startAppliedJobSimulation = async (
  simulationId: string,
  applicationId: string,
  githubUsername?: string
) => {
  const response = await fetch(`${API_BASE_URL}/simulations/my-simulations/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ simulationId, applicationId, githubUsername }),
  });
  return handleResponse(response);
};

export const cancelMySimulation = async (sessionId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/my-simulations/${sessionId}/cancel`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
};

export const getMySimulationResults = async (simulationId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/my-simulations/${simulationId}/results`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// SIMULATION SESSION ROUTES (executing and submitting)
// ════════════════════════════════════════════════════════════════════════════

// simulationAPI.ts - Fix getSimulationSession (around line 180-185)

export const getSimulationSession = async (sessionId: string) => {
  // ✅ CHANGE: Use the sessions endpoint which returns full session data with started_at
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const saveSimulationProgress = async (
  sessionId: string,
  data: { currentTask: number; answers: Record<string, any>; timeSpent?: number }
) => {
  try {
    // ✅ Normalize answer keys to "task_X" format for backend consistency
    const normalizedAnswers: Record<string, any> = {};
    for (const [key, value] of Object.entries(data.answers || {})) {
      const taskKey = String(key).startsWith('task_') ? key : `task_${key}`;
      normalizedAnswers[taskKey] = value;
    }

    console.log('📤 [saveSimulationProgress] Normalized answers:', normalizedAnswers);

    const response = await fetch(
      `${API_BASE_URL}/simulations/my-simulations/${sessionId}/progress`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentTask: data.currentTask,
          answers: normalizedAnswers,
          timeSpent: data.timeSpent,
        }),
      }
    );
    if (!response.ok) return { success: false, data: null };
    const result = await response.json();
    console.log('✅ [saveSimulationProgress] Response:', result);
    return result;
  } catch (error) {
    console.error('Save progress error:', error);
    return { success: false, data: null };
  }
};

export const submitSimulationSession = async (
  sessionId: string,
  answers: Record<string, any>,
  timeSpent: number
) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/submit`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ answers, timeSpent }),
    }
  );
  return handleResponse(response);
};

// simulationAPI.ts - Fix getSimulationSession (line ~180-185)


// ════════════════════════════════════════════════════════════════════════════
// DIRECT SIMULATION SESSIONS ROUTES (from simulation_sessions table)
// ════════════════════════════════════════════════════════════════════════════

export const getMySimulationSessions = async (params?: {
  page?: number;
  limit?: number;
  status?: 'in_progress' | 'completed' | 'all';
}) => {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.status && params.status !== 'all') {
    queryParams.append('status', params.status);
  }
  
  const url = `${API_BASE_URL}/simulations/my-simulation-sessions${queryParams.toString() ? `?${queryParams}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getSessionById = async (sessionId: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/sessions/${sessionId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const resumeSession = async (sessionId: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const cancelSession = async (sessionId: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/sessions/${sessionId}/cancel`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// LEGACY / RECRUITER ROUTES
// ════════════════════════════════════════════════════════════════════════════

export const startSimulationSession = async (
  simulationId: string,
  applicationId?: string
) => {
  const response = await fetch(`${API_BASE_URL}/simulations/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ simulationId, applicationId }),
  });
  return handleResponse(response);
};

export const previewSimulation = async (simulationId: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/${simulationId}/preview`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const testSimulationPersonally = async (simulationId: string) => {
  const response = await fetch(`${API_BASE_URL}/simulations/${simulationId}/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getSimulationStatsOverview = async (companyId?: string) => {
  const qs = companyId ? `?companyId=${companyId}` : '';
  const response = await fetch(
    `${API_BASE_URL}/simulations/stats/overview${qs}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// TASK EXECUTION ROUTES
// ════════════════════════════════════════════════════════════════════════════

export const runCode = async (
  code: string,
  language: string,
  testCases?: any[],
  simulationId?: string,
  taskId?: string
) => {
  const response = await fetch(`${API_BASE_URL}/simulations/tasks/run-code`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ code, language, testCases, simulationId, taskId }),
  });
  return handleResponse(response);
};

export const runProject = async (payload: {
  projectFiles: Record<string, string>;
  projectStructure: Record<string, any>;
  language: string;
  framework?: string;
  entryPoint?: string;
  testCases?: any[];
  simulationId?: string;
  taskId?: string;
}) => {
  const response = await fetch(`${API_BASE_URL}/simulations/tasks/run-project`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const runCommand = async (
  command: string,
  workingDirectory?: string,
  language?: string,
  framework?: string
) => {
  const response = await fetch(`${API_BASE_URL}/simulations/tasks/run-command`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ command, workingDirectory, language, framework }),
  });
  return handleResponse(response);
};

export const testProject = async (payload: {
  projectFiles: Record<string, string>;
  projectStructure: Record<string, any>;
  testCases: any[];
  language: string;
  framework?: string;
  simulationId?: string;
  taskId?: string;
}) => {
  const response = await fetch(`${API_BASE_URL}/simulations/tasks/test-project`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// TASK PROGRESS ROUTES
// ════════════════════════════════════════════════════════════════════════════

export const getSessionTaskProgress = async (sessionId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/tasks`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const updateTaskProgress = async (
  sessionId: string,
  taskIndex: number,
  data: {
    status?: 'not_started' | 'in_progress' | 'completed';
    answer?: any;
    score?: number;
    feedback?: string;
    githubCommitUrl?: string;
    timeSpent?: number;
  }
) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/tasks/${taskIndex}`,
    {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// CHAT ROUTES - BY SESSION ID
// ════════════════════════════════════════════════════════════════════════════

export const getChatMessages = async (sessionId: string, options: { limit?: number; offset?: number } = {}) => {
  const { limit = 20, offset = 0 } = options;
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat?${params}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// simulationAPI.ts - CHANGE THIS FUNCTION

// simulationAPI.ts - Change getChatMessagesWithReplies to use session ID

export const getChatMessagesWithReplies = async (
  sessionId: string,  // ← Expect SESSION ID
  options: { limit?: number; offset?: number; filter?: string } = {}
) => {
  const { limit = 50, offset = 0, filter = 'all' } = options;
  const params = new URLSearchParams({ 
    limit: limit.toString(), 
    offset: offset.toString(),
    filter 
  });
  
  // ✅ Use session-scoped endpoint
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat/threaded?${params}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// simulationAPI.ts - CHANGE sendChatMessage to use simulation ID

export const sendChatMessage = async (
  simulationId: string,  // ← Changed from sessionId to simulationId
  message: string,
  attachments: any[] = [],
  replyTo?: string | null,
  sessionId?: string | null
) => {
  // Serialize exactly once here
  const messagePayload = { text: message, attachments: attachments || [] };
  const payload: any = {
    message: JSON.stringify(messagePayload),
    messageType: 'text',
    simulationId,
  };

  if (replyTo) {
    payload.replyTo = replyTo;
  }
  if (sessionId) {
    payload.sessionId = sessionId;
  }

  // ✅ CHANGE: Use simulation-scoped endpoint (remove '/sessions/')
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
  return handleResponse(response);
};

export const editChatMessage = async (sessionId: string, messageId: string, newContent: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat/${messageId}`,
    {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message: newContent }),
    }
  );
  return handleResponse(response);
};

export const deleteChatMessage = async (sessionId: string, messageId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat/${messageId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
};

export const getUnreadMessageCount = async (sessionId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat/unread`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const markMessagesAsRead = async (sessionId: string, messageIds?: string[]) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat/mark-read`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ messageIds }),
    }
  );
  return handleResponse(response);
};

export const getChatStatistics = async (sessionId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat/statistics`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const getMessageThread = async (sessionId: string, messageId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/chat/thread/${messageId}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// CHAT ROUTES - BY SIMULATION ID (Cross-session support)
// ════════════════════════════════════════════════════════════════════════════

export const getChatMessagesBySimulation = async (
  simulationId: string, 
  options: { limit?: number; offset?: number } = {}
) => {
  const { limit = 20, offset = 0 } = options;
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat?${params}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const getChatMessagesWithRepliesBySimulation = async (
  simulationId: string,
  options: { limit?: number; offset?: number; filter?: string } = {}
) => {
  const { limit = 50, offset = 0, filter = 'all' } = options;
  const params = new URLSearchParams({ 
    limit: limit.toString(), 
    offset: offset.toString(),
    filter 
  });
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat/threaded?${params}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const sendChatMessageBySimulation = async (
  simulationId: string,
  message: string,          // ← raw text
  attachments: any[] = [],  // ← raw attachments array
  replyTo?: string | null,
  sessionId?: string | null
) => {
  // ✅ Serialize exactly once here
  const messagePayload = { text: message, attachments: attachments || [] };
  const payload: any = {
    message: JSON.stringify(messagePayload),
    messageType: 'text',
    simulationId,
  };

  if (replyTo) {
    payload.replyTo = replyTo;
  }
  if (sessionId) {
    payload.sessionId = sessionId;
  }

   const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
  return handleResponse(response);
};

export const deleteChatMessageBySimulation = async (simulationId: string, messageId: string) => {
  // ✅ CORRECT - use the simulation-scoped DELETE route
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat/${messageId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
};

export const getUnreadMessageCountBySimulation = async (simulationId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat/unread`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const markMessagesAsReadBySimulation = async (simulationId: string, messageIds?: string[]) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat/mark-read`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ messageIds }),
    }
  );
  return handleResponse(response);
};

export const getChatStatisticsBySimulation = async (simulationId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat/statistics`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// GLOBAL CHAT THREAD ROUTES (works across sessions)
// ════════════════════════════════════════════════════════════════════════════

export const getMessageThreadById = async (
  threadId: string,
  options: { sessionId?: string; simulationId?: string } = {}
) => {
  const params = new URLSearchParams();
  if (options.sessionId) params.append('sessionId', options.sessionId);
  if (options.simulationId) params.append('simulationId', options.simulationId);
  
  const response = await fetch(
    `${API_BASE_URL}/simulations/chat/threads/${threadId}${params.toString() ? `?${params}` : ''}`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// GITHUB LINKS ROUTES
// ════════════════════════════════════════════════════════════════════════════

export const updateGithubLinks = async (sessionId: string, githubLinks: any) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/github-links`,
    {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ githubLinks }),
    }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// AUTO-SAVE ROUTE
// ════════════════════════════════════════════════════════════════════════════

export const autoSaveProgress = async (
  simulationId: string,
  data: { currentTask?: number; answers?: Record<string, any>; progress?: Record<string, any> }
) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/auto-save`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }
  );
  return handleResponse(response);
};

// ════════════════════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ════════════════════════════════════════════════════════════════════════════

function deriveType(tasks: any[]): string {
  const typeMap: Record<string, string> = {
    behavioral: 'behavioral',
    case_study: 'case_study',
    role_play: 'role_play',
    presentation: 'presentation',
    cognitive: 'cognitive',
    situational: 'situational',
  };
  for (const task of tasks ?? []) {
    if (typeMap[task.type]) return typeMap[task.type];
  }
  return 'technical';
}

function buildFullPayload(simulation: any, statusOverride?: string) {
  return {
    // Core
    title:              simulation.title,
    jobRole:            simulation.jobRole,
    jobId:              simulation.jobId     ?? null,
    description:        simulation.description,
    duration:           simulation.duration,
    difficulty:         simulation.difficulty,
    status:             statusOverride || simulation.status || 'draft',

    // Content
    objectives:         simulation.objectives         ?? [],
    tasks:              simulation.tasks              ?? [],

    // Config
    scoring:            simulation.scoring            ?? {},
    settings:           simulation.settings           ?? {},
    passFailCriteria:   simulation.passFailCriteria   ?? null,
    availability:       simulation.availability       ?? null,

    // Practice
    practiceEnabled:    simulation.practiceEnabled    ?? false,
    practiceSimulation: simulation.practiceSimulation ?? null,

    // Compliance / metadata
    compliance:         simulation.compliance         ?? [],
    metadata: {
      ...(simulation.metadata ?? {}),
      availability: simulation.availability ?? null,
    },
  };
}

function buildCreatePayload(simulation: any) {
  return buildFullPayload(simulation);
}

function buildUpdatePayload(simulation: any) {
  return buildFullPayload(simulation);
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER: Create or get simulation session
// ════════════════════════════════════════════════════════════════════════════

export const getOrCreateSimulationSession = async (templateId: string, applicationId: string) => {
  try {
    const response = await startAppliedJobSimulation(templateId, applicationId);
    if (response.success && response.data?.sessionId) {
      return response;
    }
    throw new Error('Failed to create session');
  } catch (error) {
    console.error('Failed to create session:', error);
    throw error;
  }
};


// Add this to simulationAPI.ts (around line 200-250, with other GET methods)

export const getSimulationCandidates = async (
  simulationId: string,
  params?: {
    page?: number;
    limit?: number;
    status?: 'all' | 'completed' | 'in_progress';
  }
) => {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.status && params.status !== 'all') {
    queryParams.append('status', params.status);
  }
  
  const url = `${API_BASE_URL}/simulations/${simulationId}/candidates${queryParams.toString() ? `?${queryParams}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Add after the updateTaskProgress function (around line 250-280)

export const updateTaskScore = async (sessionId: string, taskIndex: number, score: number) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/tasks/${taskIndex}/score`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ score }),
    }
  );
  return handleResponse(response);
};

export const updateTaskFeedback = async (sessionId: string, taskIndex: number, feedback: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/tasks/${taskIndex}/feedback`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ feedback }),
    }
  );
  return handleResponse(response);
};

// simulationAPI.ts - Add these missing GitHub methods

// Add these after your existing imports and before the DEFAULT EXPORT

// ============================================
// GITHUB API METHODS - Add these to your simulationAPI
// ============================================

// GitHub Repository Methods
export const getFileContent = async (owner: string, repo: string, path: string, ref?: string) => {
  const params = new URLSearchParams();
  if (ref) params.append('ref', ref);
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/contents/${encodeURIComponent(path)}${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const getEverything = async (owner: string, repo: string, includeContent: boolean = true, maxFiles: number = 100) => {
  const params = new URLSearchParams({
    includeContent: includeContent.toString(),
    maxFiles: maxFiles.toString(),
  });
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/everything?${params}`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const getTree = async (owner: string, repo: string, treeSha: string, recursive?: boolean) => {
  const params = new URLSearchParams();
  if (recursive) params.append('recursive', 'true');
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/git/trees/${treeSha}${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const getReadme = async (owner: string, repo: string, ref?: string) => {
  const params = new URLSearchParams();
  if (ref) params.append('ref', ref);
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/readme${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const searchCode = async (query: string, perPage: number = 30, page: number = 1) => {
  const params = new URLSearchParams({ q: query, per_page: perPage.toString(), page: page.toString() });
  const url = `${API_BASE_URL}/github/search/code?${params}`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const compareCommits = async (owner: string, repo: string, base: string, head: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/compare/${base}...${head}`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

// GitHub Stats API Methods
export const getContributorWeeklyStats = async (owner: string, repo: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/stats/contributors`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const getParticipationStats = async (owner: string, repo: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/stats/participation`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const getCodeFrequencyStats = async (owner: string, repo: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/stats/code-frequency`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const getPunchCardStats = async (owner: string, repo: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/stats/punch-card`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

export const getCommitActivityStats = async (owner: string, repo: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/stats/commit-activity`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

// Actions / CI-CD Statistics
export const getActionsStats = async (owner: string, repo: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/actions/stats`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

// Release Statistics
export const getReleaseStats = async (owner: string, repo: string) => {
  const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/releases/stats`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};

// User Profile Stats
export const getUserProfileStats = async (username: string) => {
  const url = `${API_BASE_URL}/github/user/${username}/stats`;
  const response = await fetch(url, { 
    method: 'GET', 
    headers: getAuthHeaders() 
  });
  return handleResponse(response);
};


// Also add to the default export object (at the bottom of the file)
// Inside the default export object, add:
//   updateTaskScore,
//   updateTaskFeedback,

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Add this function to simulationAPI.ts
//
// Place it directly after `deleteChatMessageBySimulation` in the
// "CHAT ROUTES - BY SIMULATION ID" section.
// Then add `editChatMessageBySimulation` to the default export object.
// ─────────────────────────────────────────────────────────────────────────────

export const editChatMessageBySimulation = async (
  simulationId: string,
  messageId: string,
  newContent: string
) => {
  // ✅ CORRECT - single 'simulations' in path
  const response = await fetch(
    `${API_BASE_URL}/simulations/${simulationId}/chat/${messageId}`,
    {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message: newContent }),
    }
  );
  return handleResponse(response);
};


// Add this function (around line 200-210)
export const getSimulationSessionResults = async (sessionId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/simulations/sessions/${sessionId}/results`,
    { method: 'GET', headers: getAuthHeaders() }
  );
  return handleResponse(response);
};

export const calculateGitHubScoreForRepo = async (data: {
  repoUrl?: string;
  owner?: string;
  repo?: string;
  sessionId?: string;  // ✅ ADD THIS
}) => {
  const response = await fetch(`${API_BASE_URL}/simulations/github-score`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};



// ─────────────────────────────────────────────────────────────────────────────
// In the default export object, add:
//   editChatMessageBySimulation,
// alongside deleteChatMessageBySimulation.
// ─────────────────────────────────────────────────────────────────────────────


// ════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT - Add the new GitHub methods
// ════════════════════════════════════════════════════════════════════════════

export default {
  // Designer / Template Management
  getSuggestions,
  createSimulationTemplate,
  saveSimulationDraft,
  publishSimulation,
  getSimulationById,
  duplicateSimulation,
  archiveSimulation,
  deleteSimulation,
  getSimulationTemplates,
  getAllSimulations,

  // Candidate Simulation Routes
  getMySimulations,
  getMySimulationStats,
  getMySimulationById,
  resumeMySimulation,
  startAppliedJobSimulation,
  cancelMySimulation,
  getMySimulationResults,

  // Direct Simulation Session Routes
  getMySimulationSessions,
  getSessionById,
  resumeSession,
  cancelSession,

  // Simulation Session Routes (legacy)
  getSimulationSession,
  saveSimulationProgress,
  submitSimulationSession,
  getSimulationSessionResults,

  // Task Progress Routes
  getSessionTaskProgress,
  updateTaskProgress,

  // Chat Routes (by sessionId)
  getChatMessages,
  getChatMessagesWithReplies,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  getUnreadMessageCount,
  markMessagesAsRead,
  getChatStatistics,
  getMessageThread,

  // Chat Routes (by simulationId)
  getChatMessagesBySimulation,
  getChatMessagesWithRepliesBySimulation,
  sendChatMessageBySimulation,
  deleteChatMessageBySimulation,
  getUnreadMessageCountBySimulation,
  markMessagesAsReadBySimulation,
  getChatStatisticsBySimulation,

  // Global Thread Route
  getMessageThreadById,

  // GitHub Links Routes
  updateGithubLinks,

  // Auto-Save
  autoSaveProgress,

  // Executor Routes
  startSimulationSession,
  previewSimulation,
  testSimulationPersonally,
  getSimulationStatsOverview,

  // Task Execution
  runCode,
  runProject,
  runCommand,
  testProject,
  
  // Helpers
  getOrCreateSimulationSession,
  getSimulationCandidates,
  updateTaskScore,
  updateTaskFeedback,

  // ============================================
  // GITHUB API METHODS - ADD THESE
  // ============================================
  getFileContent,
  getEverything,
  getTree,
  getReadme,
  searchCode,
  compareCommits,
  getContributorWeeklyStats,
  getParticipationStats,
  getCodeFrequencyStats,
  getPunchCardStats,
  getCommitActivityStats,
  getActionsStats,
  getReleaseStats,
  getUserProfileStats,
  editChatMessageBySimulation,
  calculateGitHubScoreForRepo,
};
