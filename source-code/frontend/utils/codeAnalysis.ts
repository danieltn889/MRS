// utils/codeAnalysis.ts
export function analyzeCodeQuality(code: string): any {
  const lines = code.split('\n');
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  
  return {
    linesOfCode: nonEmptyLines.length,
    functions: extractFunctions(code),
    comments: extractComments(code),
    complexity: calculateCyclomaticComplexity(code),
    maintainability: calculateMaintainabilityIndex(code),
  };
}

function extractFunctions(code: string): number {
  const patterns = [
    /function\s+\w+\s*\([^)]*\)\s*\{/g,
    /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{/g,
    /class\s+\w+\s*\{/g,
  ];
  
  let count = 0;
  for (const pattern of patterns) {
    const matches = code.match(pattern);
    count += matches?.length || 0;
  }
  return count;
}

function extractComments(code: string): number {
  const patterns = [
    /\/\/.*/g,
    /\/\*[\s\S]*?\*\//g,
  ];
  
  let count = 0;
  for (const pattern of patterns) {
    const matches = code.match(pattern);
    count += matches?.length || 0;
  }
  return count;
}

function calculateCyclomaticComplexity(code: string): number {
  const patterns = [
    /if/g, /else/g, /for/g, /while/g, /switch/g, /case/g,
    /&&/g, /\|\|/g, /\?/g, /catch/g,
  ];
  
  let complexity = 1; // Base complexity
  for (const pattern of patterns) {
    const matches = code.match(pattern);
    complexity += matches?.length || 0;
  }
  return Math.min(100, complexity);
}

function calculateMaintainabilityIndex(code: string): number {
  const lines = code.split('\n').filter(l => l.trim().length > 0).length;
  const complexity = calculateCyclomaticComplexity(code);
  const comments = extractComments(code);
  
  let index = 171 - 5.2 * Math.log(complexity) - 0.23 * Math.log(lines) - 16.2 * Math.log(comments + 1);
  index = Math.max(0, Math.min(100, index));
  return Math.round(index);
}

export function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}