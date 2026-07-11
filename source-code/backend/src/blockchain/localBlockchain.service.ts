import { ethers } from 'ethers';
import ganache from 'ganache';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LocalBlockchainService {
  private provider: ethers.providers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;
  private contractAddress: string | null = null;
  private server: any;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    await this.startGanache();
    await this.connect();
    this.isInitialized = true;
  }

  private async startGanache(): Promise<void> {
    const options = {
      chain: { chainId: 1337, networkId: 1337 },
      wallet: {
        accounts: [{
          balance: ethers.utils.parseEther("1000").toString(),
          secretKey: "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318"
        }]
      }
    };
    
    this.server = ganache.server(options);
    this.server.listen(8545, () => {
      console.log('📍 Ganache running on http://localhost:8545');
    });
    
    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  private async connect(): Promise<void> {
    this.provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    this.wallet = new ethers.Wallet(
      '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318',
      this.provider
    );
    console.log(`🔗 Connected to local blockchain`);
    console.log(` Wallet: ${this.wallet.address}`);
    
    const balance = await this.wallet.getBalance();
    console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} ETH`);
  }

  async deployContract(abi: any, bytecode: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Service not initialized. Call initialize() first.');
    }
    
    console.log(' Deploying contract...');
    
    const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);
    const contract = await factory.deploy();
    await contract.deployed();
    
    this.contractAddress = contract.address;
    this.contract = contract;
    
    // Save contract address
    const addressPath = path.join(__dirname, '../../contract.address');
    fs.writeFileSync(addressPath, this.contractAddress);
    
    console.log(`''Contract deployed: ${this.contractAddress}`);
    return this.contractAddress;
  }

  async storeSimulation(data: {
    sessionId: string;
    userId: string;
    overallScore: number;
    technicalScore: number;
    punctualityScore: number;
    adaptabilityScore: number;
    githubScore: number;
  }) {
    if (!this.contract) {
      throw new Error('Contract not deployed. Call deployContract() first.');
    }

    console.log(' Storing simulation on blockchain...');
    
    const tx = await this.contract.storeResult(
      data.sessionId,
      data.userId,
      data.overallScore,
      data.technicalScore,
      data.punctualityScore,
      data.adaptabilityScore,
      data.githubScore,
      { gasLimit: 500000 }
    );
    
    console.log(`⏳ Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`''Stored on blockchain!`);
    console.log(`   TX: ${receipt.transactionHash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
    
    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber
    };
  }

  async getSimulation(sessionId: string): Promise<any> {
    if (!this.contract) {
      throw new Error('Contract not deployed. Call deployContract() first.');
    }
    
    const result = await this.contract.getResult(sessionId);
    return {
      candidate: result.candidate,
      overallScore: Number(result.overallScore),
      timestamp: new Date(Number(result.timestamp) * 1000),
      verified: result.verified
    };
  }

  async verifySimulation(sessionId: string): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Contract not deployed. Call deployContract() first.');
    }
    
    const tx = await this.contract.verifyResult(sessionId, { gasLimit: 100000 });
    await tx.wait();
    console.log(`''Simulation ${sessionId} verified on blockchain`);
    return true;
  }

  async getBalance(): Promise<string> {
    if (!this.wallet) throw new Error('Service not initialized');
    const balance = await this.wallet.getBalance();
    return ethers.utils.formatEther(balance);
  }

  isDeployed(): boolean {
    return this.contract !== null && this.contractAddress !== null;
  }

  getContractAddress(): string | null {
    return this.contractAddress;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      console.log('🛑 Ganache stopped');
    }
  }
}