# Free on-chain anchoring on the Sepolia testnet

Your blockchain works **for free in the database** (the `audit_chain` hash-chain) with no setup.
This guide is **optional**   it adds *real, public, free* on-chain anchoring on the **Sepolia**
Ethereum testnet. The Hardhat config already has a `sepolia` network wired up.

## What you provide (the only manual part)
1. **A free wallet**   MetaMask (or any) → copy its **private key** (no `0x` prefix).
2. **Free test ETH**   from a Sepolia faucet (enough for one deploy + writes), e.g.:
   - https://sepoliafaucet.com  ·  https://cloud.google.com/application/web3/faucet/ethereum/sepolia
   (Send it to your wallet address   testnet ETH is free and has no real value.)

## 1. Configure the deploy wallet
Set these (a `.env` in `source-code/blockchain/`, or inline before the command):
```
ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com   # free public RPC (or your Alchemy URL)
ETHEREUM_PRIVATE_KEY=<your wallet private key, no 0x>
```

## 2. Compile + deploy the contract to Sepolia
```bash
cd source-code/blockchain
npm install                 # first time only
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```
Copy the **deployed contract address** printed at the end.

## 3. Point the backend at Sepolia (on the server)
The backend reads these env vars (no code change needed   `blockchain.service.ts` is env-driven):
```
BLOCKCHAIN_RPC_URL=https://ethereum-sepolia.publicnode.com
CONTRACT_ADDRESS=<the address from step 2>
ETHEREUM_NETWORK=sepolia
USE_BLOCKCHAIN=true
```
Set them in `~/SVWR-CFE/source-code/backend/.env`, then `pm2 restart backend`.

## Notes
- **Free & persistent**   testnet, so it costs nothing and the data stays (unlike a local Hardhat
  node, which resets on restart).
- **Not real money**   testnet ETH has no value; good for a demo/capstone, not for production proof.
- The **DB hash-chain still runs in parallel** and remains the primary record   this just mirrors
  credential hashes on a public chain for extra verifiability.
- Keep your private key only in the server `.env` (git-ignored). Never commit it.
