import { LLMProvider } from "./types";
import { NvidiaNimProvider } from "./nvidia-nim";
import { DeepInfraProvider } from "./deepinfra";

export function getLLMProvider(): LLMProvider {
  const providerName = process.env.LLM_PROVIDER;
  const model = process.env.LLM_MODEL || "meta/llama-3.1-70b-instruct";

  if (!providerName) {
    throw new Error(
      "LLM_PROVIDER environment variable is required. Set it to 'nvidia-nim' or 'deepinfra'."
    );
  }

  switch (providerName.toLowerCase()) {
    case "nvidia-nim": {
      const apiKey = process.env.NVIDIA_NIM_API_KEY;
      if (!apiKey) {
        throw new Error("NVIDIA_NIM_API_KEY environment variable is required for nvidia-nim provider.");
      }
      return new NvidiaNimProvider(apiKey, model);
    }

    case "deepinfra": {
      const apiKey = process.env.DEEPINFRA_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPINFRA_API_KEY environment variable is required for deepinfra provider.");
      }
      return new DeepInfraProvider(apiKey, model);
    }

    default:
      throw new Error(
        `Unknown LLM provider: "${providerName}". Supported providers: nvidia-nim, deepinfra.`
      );
  }
}
