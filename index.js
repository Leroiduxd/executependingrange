import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_READ);
const contractAddress = process.env.CONTRACT_ADDRESS;

const ABI = [
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "pendingOrders",
    "outputs": [
      { "internalType": "address", "name": "user", "type": "address" },
      { "internalType": "uint256", "name": "assetIndex", "type": "uint256" },
      { "internalType": "uint256", "name": "usdSize", "type": "uint256" },
      { "internalType": "uint256", "name": "leverage", "type": "uint256" },
      { "internalType": "bool", "name": "isLong", "type": "bool" },
      { "internalType": "uint256", "name": "slPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "tpPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const contract = new ethers.Contract(contractAddress, ABI, provider);

app.get("/get-asset-indexes", async (req, res) => {
  const start = parseInt(req.query.start);
  const end = parseInt(req.query.end);

  if (isNaN(start) || isNaN(end) || start > end) {
    return res.status(400).json({ error: "Invalid 'start' and 'end' params" });
  }

  const results = [];

  for (let i = start; i <= end; i++) {
    try {
      const order = await contract.pendingOrders(i);
      if (order.user !== "0x0000000000000000000000000000000000000000") {
        results.push({ orderId: i, assetIndex: order.assetIndex.toString() });
      }
    } catch (err) {
      // ignore invalid or non-existing orders
    }
  }

  res.json({ count: results.length, results });
});

app.listen(port, () => {
  console.log(`🟢 API listening on port ${port}`);
});
