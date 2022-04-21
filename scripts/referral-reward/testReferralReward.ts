import { ethers, network,  } from "hardhat";
import { BigNumber } from "ethers";
import BalanceTree from "../merkle-distributor/balance-tree";
import { StakingPoolABI, ERC20ABI } from "../constant";
import moment from "moment";
const ether = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.parseEther(amount.toString());
  return BigNumber.from(weiString);
};



async function test() {
  const poolIds = [2, 3]; //YB-SCI, YB-MCI
  const stakingPools = await ethers.getContractAt(StakingPoolABI, "0x35bE7982bC5E40A8C9aF39A639bDDcE32081102e")
  const account1 = "0xa6d8E935b792b3fe5B4516f847B5Bf5310b5AfB1";
  const account2 = "0xA9C0425802a7d2c72F795736Cdfb608BdBF8C217";
//  const account3 = "0x1743B331c5DBE807d4e87A65312C630AF5290Ab7";
  for(let i = 0 , l = poolIds.length; i < l; i++) {
      const poolId = poolIds[i];
      const poolToken = await stakingPools.getPoolToken(poolId)
      const token = await ethers.getContractAt(ERC20ABI, poolToken)
      const symbol = await token.symbol();
      const balance1  = await token.balanceOf(account1);
      console.log(`account|${account1}|${symbol}|balanceOf|${ethers.utils.formatEther(balance1)}`)
      const balance2  = await token.balanceOf(account2);
      console.log(`account|${account2}|${symbol}|balanceOf|${ethers.utils.formatEther(balance2)}`)
    //   const balance3  = await token.balanceOf(account3);
    //   console.log(`account|${account3}|${symbol}|balanceOf|${ethers.utils.formatEther(balance3)}`)
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [account1] });
      const account1Signer = ethers.provider.getSigner(account1)
      await stakingPools.connect(account1Signer).deposit(poolId, ethers.utils.parseEther(`${(parseFloat(ethers.utils.formatEther(balance1)) * 0.3)}`) , account2);
      console.log(`account|${account1}|${symbol}|balanceOf|${ethers.utils.formatEther(await token.balanceOf(account1))}`)
  }

  for(let i = 0 , l = poolIds.length; i < l; i++) {
    const poolId = poolIds[i];
    const account2Poolreferee = await stakingPools.getPoolreferee(
      poolId,
      account2
    );
    console.log({
      account2Poolreferee,
    });

    for (let i = 0, l = account2Poolreferee.length; i < l; i++) {
    //   const getStakeTotalDeposited = await stakingPools.getStakeTotalDeposited(
    //     account2Poolreferee[i],
    //     2
    //   );
    //   console.log({
    //     getStakeTotalDeposited: ethers.utils.formatEther(
    //       getStakeTotalDeposited
    //     ),
    //   });
      const getUserDeposits = await stakingPools.getUserDeposits(
        poolId,
        account2Poolreferee[i]
      );
      for (let i = 0, l = getUserDeposits.length; i < l; i++) {
        const userDeposit = getUserDeposits[i];
        console.log({
          amount: ethers.utils.formatEther(userDeposit.amount),
          time: moment(new Date(userDeposit.timestamp * 1000)).format(
            "YYYYMMDD HH:mm:ss"
          ),
        });
      }
      // console.log({
      //   getUserDeposits: ethers.utils.formatEther(getUserDeposits[0].amount),
      //   getUserDepositsaa: getUserDeposits[0].timestamp.toString()
      // })
    }

  }

 
  



  
  
}
async function test2() {
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
  let tree = new BalanceTree([
    { account: user1.address, amount: ethers.utils.parseEther("100") },
    { account: user2.address, amount: ethers.utils.parseEther("99") },
  ])

  const reward = await MockCOOKFactory.connect(admin1).deploy(ethers.utils.parseEther("100000000"))

  const referralReward = await ReferralRewardFactory.connect(admin1).deploy(reward.address, tree.getHexRoot());
  await reward.connect(admin1).transfer(referralReward.address, ethers.utils.parseEther("10000000"));
  let owner = await referralReward.owner()
  console.log(`ReferralReward deployed to: ${referralReward.address} | owner is ${owner}`);
  await referralReward.transferAdmin(admin2.address)
  owner = await referralReward.owner()
  console.log(`After transferAdmin | owner ${owner}`);

  const proof0 = tree.getProof(0, user1.address, ethers.utils.parseEther("100"))

  await referralReward.connect(user1).claim(0, user1.address, ethers.utils.parseEther("100"), proof0);
  const user1CookBalance = await reward.balanceOf(user1.address);
  console.log(`After claim | user1 ${user1.address}  ${ethers.utils.formatEther(user1CookBalance)}`);

  tree = new BalanceTree([
    { account: user1.address, amount: ethers.utils.parseEther("999") },
    { account: user2.address, amount: ethers.utils.parseEther("999") },
  ])
  await referralReward.connect(admin2).updateRewards(tree.getHexRoot())
  {
    const proof0 = tree.getProof(0, user1.address, ethers.utils.parseEther("999"))

    await referralReward.connect(user1).claim(0, user1.address, ethers.utils.parseEther("999"), proof0);
    const user1CookBalance = await reward.balanceOf(user1.address);
    console.log(`After claim | user1 ${user1.address}  ${ethers.utils.formatEther(user1CookBalance)}`);
  }





  // const proof1 = tree.getProof(1, user2.address, ethers.utils.parseEther("99"))

  // await referralReward.connect(user2).claim(0, user2.address, ethers.utils.parseEther("100"),  proof1);
  // await referralReward.connect(admin2).updateRewards(user1.address, ethers.utils.parseEther("100"))
  // const userRewardBalance = await referralReward.userRewardBalance(user1.address)
  // console.log(`After updateRewards | user1 ${user1.address}  ${ethers.utils.formatEther(userRewardBalance)}`);
  // const user1CookBalance = await reward.balanceOf(user1.address);
  // console.log(`After claim | user1 ${user1.address}  ${ethers.utils.formatEther(user1CookBalance)}`);
  // await referralReward.connect(admin2).transferReward(user2.address, ethers.utils.parseEther("99"));
  // const user2CookBalance = await reward.balanceOf(user2.address);
  // console.log(`After transferReward | user2 ${user2.address}  ${ethers.utils.formatEther(user2CookBalance)}`);
}
async function main() {
  await test2()
 

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });