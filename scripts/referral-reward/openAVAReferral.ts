import { ethers, network,  } from "hardhat";
import { BigNumber } from "ethers";

import { StakingPoolABI } from "../constant";
const ether = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.parseEther(amount.toString());
  return BigNumber.from(weiString);
};
const AVA_STAKINGPOOLS_ADDRESS = "0x35bE7982bC5E40A8C9aF39A639bDDcE32081102e";

async function startReferralBonus() {
  const stakingPools = await ethers.getContractAt(StakingPoolABI, AVA_STAKINGPOOLS_ADDRESS)
  const poolCount = await stakingPools.poolCount();
  const governance = await stakingPools.governance();
  console.log("poolCount", poolCount.toNumber());
  console.log("governance", governance);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [governance] });
  const admin = ethers.provider.getSigner(governance);
  for (let poolId = 0; poolId < poolCount; poolId++) {
    await stakingPools.connect(admin).startReferralBonus(poolId)
    console.log(`pool ${poolId} startReferralBonus success`)
  }
}



async function main() {
  await startReferralBonus()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });