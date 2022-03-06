import { ethers, network,  } from "hardhat";
import { BigNumber } from "ethers";
import BalanceTree from "../merkle-distributor/balance-tree"
import { ERC20ABI } from "../constant";
import moment from "moment";
import { ZERO_ADDRESS } from "../../test/utils/helper";
const ether = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.parseEther(amount.toString());
  return BigNumber.from(weiString);
};



async function main() {
  const [
    admin1,
  ] = await ethers.getSigners();
  const tree = new BalanceTree([
    { account: ZERO_ADDRESS, amount: ethers.utils.parseEther("0") }
  ])
  const ReferralRewardFactory = await ethers.getContractFactory("ReferralReward"); 
  const COOK = "0x637afeff75ca669fF92e4570B14D6399A658902f"
 
  const COOKContract = await ethers.getContractAt(ERC20ABI, COOK)
  
  const referralReward = await ReferralRewardFactory.connect(admin1).deploy(COOK, tree.getHexRoot());
  const owner = await referralReward.owner()
  const CookHolderAddress = "0xe3C4992940fC783083e6255C3A9231A4b802158a";
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [CookHolderAddress] });
  const CookHolder = ethers.provider.getSigner(CookHolderAddress)
  await COOKContract.connect(CookHolder).transfer(referralReward.address, 1000000);
  const balance = await COOKContract.balanceOf(referralReward.address)
  console.log(`ReferralReward deployed to: ${referralReward.address} | owner is ${owner} | balance ${ethers.utils.formatEther(balance)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });