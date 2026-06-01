import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BlockchainService {
  private provider: ethers.providers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract | null = null;
  private contractAddress: string;

  constructor() {
    // Connect to Ganache
    this.provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    
    // Use Ganache's first account
    const privateKey = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    // Get contract address from environment or file
    this.contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS || 
                          this.loadContractAddress();
    
    console.log(`🔗 Blockchain connected: ${this.contractAddress}`);
    console.log(`👤 Wallet: ${this.wallet.address}`);
  }

  private loadContractAddress(): string {
    try {
      const addressPath = path.join(__dirname, '../../../blockchain/contract.address');
      if (fs.existsSync(addressPath)) {
        return fs.readFileSync(addressPath, 'utf8').trim();
      }
    } catch (error) {
      console.warn('No contract address found');
    }
    return '';
  }

  async initializeContract(abi: any) {
    if (!this.contractAddress) {
      throw new Error('Contract address not set');
    }
    this.contract = new ethers.Contract(this.contractAddress, abi, this.wallet);
    console.log('✅ Contract initialized');
  }

  async storeSimulationResult(data: {
    sessionId: string;
    candidateAddress: string;
    overallScore: number;
    technicalScore: number;
    punctualityScore: number;
    adaptabilityScore: number;
    githubScore: number;
  }) {
    if (!this.contract) {
      throw new Error('Contract not initialized. Call initializeContract() first.');
    }

    console.log('📝 Storing simulation on blockchain...');
    
    const tx = await this.contract.storeResult(
      data.sessionId,
      data.candidateAddress,
      data.overallScore,
      data.technicalScore,
      data.punctualityScore,
      data.adaptabilityScore,
      data.githubScore,
      { gasLimit: 500000 }
    );
    
    console.log(`⏳ Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`✅ Stored on blockchain! Block: ${receipt.blockNumber}`);
    
    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber
    };
  }

  async getSimulation(sessionId: string) {
    if (!this.contract) throw new Error('Contract not initialized');
    
    const result = await this.contract.getResult(sessionId);
    return {
      candidate: result.candidate,
      overallScore: Number(result.overallScore),
      timestamp: new Date(Number(result.timestamp) * 1000),
      verified: result.verified
    };
  }

  async verifySimulation(sessionId: string) {
    if (!this.contract) throw new Error('Contract not initialized');
    
    const tx = await this.contract.verifyResult(sessionId, { gasLimit: 100000 });
    await tx.wait();
    return tx.hash;
  }
}