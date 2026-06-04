// backend/src/services/localBlockchain.service.ts
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LocalBlockchainService {
  private provider: ethers.providers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract | null = null;
  private contractAddress: string | null = null;
  private isInitialized: boolean = false;

  constructor(rpcUrl: string = 'http://localhost:8545') {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Default Hardhat test account #0 private key
    const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || 
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    console.log(`🔗 Connected to blockchain at ${rpcUrl}`);
    console.log(`👤 Wallet address: ${this.wallet.address}`);
  }

  async initializeContract(abi: any): Promise<boolean> {
    try {
      // Try to read contract address from blockchain folder
      const contractAddressPath = path.join(__dirname, '../../../blockchain/contract.address');
      
      if (fs.existsSync(contractAddressPath)) {
        this.contractAddress = fs.readFileSync(contractAddressPath, 'utf8').trim();
        console.log(`📄 Contract address loaded from: ${contractAddressPath}`);
        console.log(`   Address: ${this.contractAddress}`);
      } else {
        // Try environment variable
        this.contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS || null;
        
        if (!this.contractAddress) {
          console.warn('⚠️ No contract address found. Please deploy the contract first.');
          console.log('📝 Run: cd blockchain && npx hardhat run scripts/deploy.js --network localhost');
          return false;
        }
      }
      
      this.contract = new ethers.Contract(this.contractAddress, abi, this.wallet);
      this.isInitialized = true;
      console.log(`✅ Contract initialized at: ${this.contractAddress}`);
      return true;
    } catch (error: any) {
      console.error('❌ Failed to initialize contract:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  async storeSimulationResult(data: {
    sessionId: string;
    candidateAddress: string;
    overallScore: number;
    technicalScore: number;
    punctualityScore: number;
    adaptabilityScore: number;
    githubScore: number;
  }): Promise<{ txHash: string; blockNumber: number }> {
    if (!this.contract || !this.isInitialized) {
      throw new Error('Contract not initialized. Call initializeContract() first.');
    }

    try {
      console.log('📝 Storing simulation on blockchain...');
      console.log(`   Session: ${data.sessionId}`);
      console.log(`   Candidate: ${data.candidateAddress}`);
      console.log(`   Score: ${data.overallScore}`);
      
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
    } catch (error: any) {
      console.error('❌ Failed to store on blockchain:', error.message);
      throw error;
    }
  }

  async getSimulationResult(sessionId: string): Promise<any> {
    if (!this.contract || !this.isInitialized) {
      throw new Error('Contract not initialized. Call initializeContract() first.');
    }

    try {
      // ✅ Now correctly reads the full struct object returned by the Solidity update
      const result = await this.contract.getResult(sessionId);
      
      // Safety guard against empty address indicators for uninitialized states
      if (!result.candidate || result.candidate === ethers.constants.AddressZero) {
        return null;
      }

      return {
        candidate: result.candidate,
        overallScore: result.overallScore.toNumber(),
        technicalScore: result.technicalScore?.toNumber() || 0,
        punctualityScore: result.punctualityScore?.toNumber() || 0,
        adaptabilityScore: result.adaptabilityScore?.toNumber() || 0,
        githubScore: result.githubScore?.toNumber() || 0,
        timestamp: new Date(result.timestamp.toNumber() * 1000).toISOString(),
        verified: result.verified
      };
    } catch (error: any) {
      console.error('❌ Failed to get simulation:', error.message);
      throw error;
    }
  }

  async verifySimulationResult(sessionId: string): Promise<string> {
    if (!this.contract || !this.isInitialized) {
      throw new Error('Contract not initialized. Call initializeContract() first.');
    }

    try {
      const tx = await this.contract.verifyResult(sessionId, { gasLimit: 200000 });
      const receipt = await tx.wait();
      console.log(`✅ Simulation verified in block ${receipt.blockNumber}`);
      return receipt.transactionHash;
    } catch (error: any) {
      console.error('❌ Failed to verify simulation:', error.message);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.contract !== null;
  }
}

export default new LocalBlockchainService();