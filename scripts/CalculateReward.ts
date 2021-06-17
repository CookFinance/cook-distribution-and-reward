import { ethers } from "hardhat";
import BigNumber from "bignumber.js";
import {RewardVestingABI, StakingPoolABI} from "./constant"


export const toTokenUnitsBN = (
  tokenAmount: string | number | BigNumber,
  tokenDecimals: number = 18
): number => {
  const amt = new BigNumber(tokenAmount.toString());
  const digits = new BigNumber(10).pow(new BigNumber(tokenDecimals));
  return amt.div(digits).toNumber();
};

const depositors = ["0x0"]
// ETH
const stakingPoolAddr = "0x4b21da40dd8d9f4363e69a9a1620d7cdb49123be";
const rewardVestingAddr = "0xe9c1d4422a5c777615d0805ecb637cb90863f7bb";
// BSC
// const stakingPoolAddr = "0x47b517061841e6bFaaeB6336C939724F47e5E263";
// const rewardVestingAddr = "0x4C46dC88B1ec9B7663Eb7C6aD341CBF9467391f0";

async function main() {
    const accounts = await ethers.getSigners();
    console.log("=========== Calculating distributed LP reward ===========", accounts[0].address);
    var totalDistributedReward = 0

    const stakingPool = await ethers.getContractAt(StakingPoolABI, stakingPoolAddr);
    const rewardVesting = await ethers.getContractAt(RewardVestingABI, rewardVestingAddr);

    for (var i = 0; i < depositors.length; i++) {
      const address = depositors[i]
      const claimableAmount = toTokenUnitsBN(await stakingPool.getStakeTotalUnclaimed(address, 0));
      const earnedBalanceObj = await rewardVesting.earnedBalances(address);
      const earnedBalance = toTokenUnitsBN(earnedBalanceObj["total"]);

      totalDistributedReward = claimableAmount + totalDistributedReward;
      totalDistributedReward = earnedBalance + totalDistributedReward;
    }

    console.log(totalDistributedReward);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });