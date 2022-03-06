import { ethers, network,  } from "hardhat";
import { BigNumber } from "ethers";

import { StakingPoolABI } from "../constant";
const ether = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.parseEther(amount.toString());
  return BigNumber.from(weiString);
};
const AVA_STAKINGPOOLS_ADDRESS = "0x35bE7982bC5E40A8C9aF39A639bDDcE32081102e";





async function main() {
 // await startReferralBonus()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });