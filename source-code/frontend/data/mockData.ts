import React from 'react';

// Mock Jobs Data
export const mockJobs = [
  {
    id: 1,
    title: 'Smart Contract Developer',
    location: 'Rwanda Poly Hub Huye',
    company: 'BlockChain Innovators',
    matchPercentage: 95,
    skills: ['Solidity', 'Truffle', 'Web3.js', 'Ethereum'],
    salaryMin: 80,
    salaryMax: 120,
    experience: '3-5 years',
    postedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    description: 'We are looking for an experienced Smart Contract developer to join our growing team.'
  },
  {
    id: 2,
    title: 'Blockchain Engineer',
    location: 'Rwanda Poly Hub Huye',
    company: 'DeFi Solutions',
    matchPercentage: 88,
    skills: ['Solidity', 'Hardhat', 'TypeScript', 'AWS'],
    salaryMin: 75,
    salaryMax: 110,
    experience: '2-4 years',
    postedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
    description: 'Join our team to build innovative DeFi protocols and solutions.'
  },
  {
    id: 3,
    title: 'Cryptocurrency Analyst',
    location: 'Rwanda Poly Hub Huye',
    company: 'CryptoVault Assets',
    matchPercentage: 82,
    skills: ['Python', 'Data Analysis', 'Blockchain', 'SQL'],
    salaryMin: 65,
    salaryMax: 95,
    experience: '2-3 years',
    postedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
    description: 'Analyze crypto markets and provide insights to guide investment strategies.'
  },
  {
    id: 4,
    title: 'Web3 Full Stack Developer',
    location: 'Rwanda Poly Hub Huye',
    company: 'MetaVerse Labs',
    matchPercentage: 92,
    skills: ['React', 'Node.js', 'Web3', 'MongoDB'],
    salaryMin: 85,
    salaryMax: 130,
    experience: '4-6 years',
    postedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
    description: 'Build cutting-edge Web3 applications that revolutionize how users interact with blockchain.'
  }
];

// Mock Simulations Data
export const mockSimulations = [
  {
    id: 'sim-001',
    title: 'Smart Contract Audit Challenge',
    description: 'Find and fix vulnerabilities in a sample smart contract.',
    date: 'Apr 5, 2026',
    duration: 60,
    progress: 45,
    skills: ['Solidity', 'Security']
  },
  {
    id: 'sim-002',
    title: 'DeFi Protocol Design',
    description: 'Design a decentralized lending protocol from scratch.',
    date: 'Apr 10, 2026',
    duration: 90,
    progress: 20,
    skills: ['Blockchain', 'Economics']
  },
  {
    id: 'sim-003',
    title: 'Blockchain Architecture',
    description: 'Build a custom blockchain consensus mechanism.',
    date: 'Apr 15, 2026',
    duration: 120,
    progress: 0,
    skills: ['Cryptography', 'System Design']
  },
  {
    id: 'sim-004',
    title: 'Gas Optimization Sprint',
    description: 'Optimize smart contracts for minimal gas consumption.',
    date: 'Apr 20, 2026',
    duration: 45,
    progress: 100,
    skills: ['Solidity', 'Optimization']
  }
];

export default { mockJobs, mockSimulations };
