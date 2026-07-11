# MRS Blockchain Layer

This folder contains the Hardhat blockchain layer for the MRS capstone project. It supports immutable storage and verification of virtual work simulation results.

## Company Information

| Item | Details |
|------|---------|
| Company name | Mpuza Inc. |
| Physical address | Kk737St, Kigali, Rwanda |
| Official email | info@mpuza.com |
| Phone | +250786397515 |
| Industry supervisor | Derek J. Blair |
| Supervisor job title | CTO |
| Supervisor email | jbderek@mpuza.com |
| Supervisor phone | +16505077742 |

## Purpose

The blockchain module records selected simulation outcomes in a tamper-resistant way so recruiters and candidates can verify assessment integrity. Local development uses a Hardhat network and the `LocalSimulation` contract.

## Tech Stack

- Solidity smart contracts
- Hardhat
- Ethers.js v5
- Local Hardhat blockchain network

## Setup

Install dependencies:

```bash
npm install
```

Compile contracts:

```bash
npm run compile
```

Start a local Hardhat node:

```bash
npm run node
```

Deploy to the local network in a second terminal:

```bash
npm run deploy:local
```

## Useful Commands

```bash
npm run compile       # Compile smart contracts
npm run node          # Start local Hardhat blockchain
npm run deploy:local  # Deploy contract to localhost
npm run clean         # Clean Hardhat artifacts/cache
```
# Run tests
npx hardhat test

# Open Hardhat console
npx hardhat console --network hardhat
## Integration Notes

After deployment, the contract address is stored in `contract.address`. The backend blockchain service uses this address, the contract ABI, and the configured RPC URL to store and read simulation verification data.
