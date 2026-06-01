type EvaluationInput = {
  code?: string;
  essay?: string;
  githubRepo?: {
    files?: Record<string, string>;
    fileStructure?: Array<{ path?: string; type?: string; size?: number }>;
    stats?: any;
    githubScore?: any;
  };
  userAnswer?: {
    comment?: string;
    challenges?: string;
    suggestions?: string;
    githubCommitUrl?: string;
  };
};

const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.html', '.css'];

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const getRepoCodeFiles = (input: EvaluationInput) => {
  const files = input.githubRepo?.files || {};
  const fileStructure = input.githubRepo?.fileStructure || [];
  const fileNames = Object.keys(files).length > 0
    ? Object.keys(files)
    : fileStructure.map(file => file.path || '').filter(Boolean);

  return fileNames.filter(path => codeExtensions.some(ext => path.toLowerCase().endsWith(ext)));
};

const aiEvaluationService = {
  evaluateTask(input: EvaluationInput) {
    const code = input.code || Object.values(input.githubRepo?.files || {}).join('\n');
    const codeFiles = getRepoCodeFiles(input);
    const githubScore = input.githubRepo?.githubScore?.score;
    const hasSubmissionText = Boolean(
      input.userAnswer?.comment ||
      input.userAnswer?.challenges ||
      input.userAnswer?.suggestions ||
      input.essay
    );

    const lines = code ? code.split(/\r?\n/).filter(line => line.trim()).length : 0;
    const functionCount = (code.match(/\b(function|const|let|var|def|class)\b/g) || []).length;
    const commentLines = code.split(/\r?\n/).filter(line => /^\s*(\/\/|#|\/\*|\*)/.test(line)).length;
    const commentRatio = lines > 0 ? clamp((commentLines / lines) * 100) : 0;

    const detailedScores = {
      codeQuality: clamp(codeFiles.length >= 3 || lines >= 40 ? 75 : codeFiles.length > 0 || lines > 0 ? 70 : 45),
      completeness: clamp(hasSubmissionText ? 65 : input.userAnswer?.githubCommitUrl ? 55 : 50),
      bestPractices: clamp(code.includes('try') || code.includes('catch') || code.includes('validate') ? 75 : 65),
      documentation: clamp(commentRatio > 10 || input.githubRepo?.stats?.community?.hasReadme ? 60 : 30),
      efficiency: clamp(lines > 0 || codeFiles.length > 0 ? 100 : 50),
    };

    const baseScore = Object.values(detailedScores).reduce((sum, value) => sum + value, 0) / 5;
    const score = clamp(typeof githubScore === 'number' ? (baseScore * 0.75) + (githubScore * 0.25) : baseScore);

    const improvements = [];
    if (detailedScores.documentation < 60) improvements.push('Add more comments to explain your code');
    if (detailedScores.bestPractices < 75) improvements.push('Add error handling for edge cases');
    if (detailedScores.completeness < 70) improvements.push('Include a clearer completion summary for the task');

    return {
      score,
      feedback: score >= 80
        ? 'Strong submission. The solution is clear and well organized.'
        : score >= 60
          ? `Fair attempt. Good code structure and organization. Focus on: ${improvements.slice(0, 2).join('. ')}.`
          : `Needs more work. Focus on: ${improvements.slice(0, 2).join('. ')}.`,
      strengths: codeFiles.length > 0 || lines > 0
        ? ['Good code structure and organization']
        : ['Submission includes task context'],
      improvements,
      detailedScores,
      suggestions: [
        'Break down large functions into smaller, reusable pieces',
        'Add input validation for user-provided data',
        'Consider using design patterns for better architecture',
      ],
      metrics: {
        linesOfCode: lines,
        functionCount,
        commentRatio,
        complexity: Math.max(1, functionCount),
      },
    };
  },
};

export default aiEvaluationService;
