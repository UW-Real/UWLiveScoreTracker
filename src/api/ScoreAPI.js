import AxiosInstance from "@/utils/axiosInstance";


async function getScore() {
  const response = await AxiosInstance.get("/score");

  return response.data;
}

export { getScore };