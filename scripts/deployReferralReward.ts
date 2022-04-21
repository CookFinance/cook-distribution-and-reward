import { ethers, network } from "hardhat";
import { BigNumber  } from "ethers";
const ether = (amount: number | string): BigNumber => {
    const weiString = ethers.utils.parseEther(amount.toString());
    return BigNumber.from(weiString);
  };
async function main() {
    const [
       admin1,
       admin2,
       user1,
       user2
    ] = await ethers.getSigners();
    console.log({
        admin1: admin1.address,
        admin2: admin2.address
    })
    const ReferralRewardFactory = await ethers.getContractFactory("ReferralReward");
   // const COOK_ON_ETH_ADDRESS = "0xff75ced57419bcaebe5f05254983b013b0646ef5"
    const MockCOOKFactory = await ethers.getContractFactory("MockCOOK");
    const reward = await MockCOOKFactory.connect(admin1).deploy(ethers.utils.parseEther("100000000"))
    const referralReward = await ReferralRewardFactory.connect(admin1).deploy(reward.address);
    await reward.connect(admin1).transfer(referralReward.address, ethers.utils.parseEther("10000000")); 
    let owner = await referralReward.owner()
    console.log(`ReferralReward deployed to: ${referralReward.address} | owner is ${owner}`);
    await referralReward.transferAdmin(admin2.address)
    owner = await referralReward.owner()
    console.log(`After transferAdmin | owner ${owner}`);
    await referralReward.connect(admin2).updateRewards(user1.address, ethers.utils.parseEther("100"))
    const userRewardBalance = await referralReward.userRewardBalance(user1.address)
    console.log(`After updateRewards | user1 ${user1.address}  ${ethers.utils.formatEther(userRewardBalance)}`);
    await referralReward.connect(user1).claim();
    const user1CookBalance = await reward.balanceOf(user1.address);
    console.log(`After claim | user1 ${user1.address}  ${ethers.utils.formatEther(user1CookBalance)}`);
    await referralReward.connect(admin2).transferReward(user2.address, ethers.utils.parseEther("99"));
    const user2CookBalance = await reward.balanceOf(user2.address);
    console.log(`After transferReward | user2 ${user2.address}  ${ethers.utils.formatEther(user2CookBalance)}`);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });