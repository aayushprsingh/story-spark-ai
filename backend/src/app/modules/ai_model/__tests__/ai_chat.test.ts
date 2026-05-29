import httpStatus from "http-status";
import { chatWithGemini } from "../ai_model.utils";
import { AiModelService } from "../ai_model.service";
import {
  GenerationTimeoutError,
  raceGenerationWithTimeout,
} from "../../../../utils/generation_timeout";
import { User } from "../../user/user.model";

jest.mock("../ai_model.utils", () => ({
  chatWithGemini: jest.fn(),
}));

jest.mock("../../../../utils/generation_timeout", () => ({
  ...jest.requireActual("../../../../utils/generation_timeout"),
  raceGenerationWithTimeout: jest.fn(),
}));

jest.mock("../../user/user.model", () => ({
  User: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));

const mockedChat = chatWithGemini as jest.MockedFunction<typeof chatWithGemini>;
const mockedRace = raceGenerationWithTimeout as jest.MockedFunction<typeof raceGenerationWithTimeout>;
const mockedUser = User as any;

describe("AiModelService - Chat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRace.mockImplementation(async (operation) => operation({} as AbortSignal));
  });

  it("returns chat response on success for authenticated user", async () => {
    mockedChat.mockResolvedValue("Hello there!");
    mockedUser.findOne.mockResolvedValue({
      email: "user@example.com",
      subscriptionType: "free",
      requestsThisMonth: 0,
      lastRequestDate: new Date(),
    });
    mockedUser.findOneAndUpdate.mockResolvedValue({
      email: "user@example.com",
      requestsThisMonth: 1,
    });

    const result = await AiModelService.aiModelChat(
      { message: "Hi", history: [] },
      { email: "user@example.com" } as any
    );

    expect(result).toBe("Hello there!");
    expect(mockedChat).toHaveBeenCalledWith("Hi", []);
  });

  it("returns chat response for guest user", async () => {
    mockedChat.mockResolvedValue("Hi guest!");

    const result = await AiModelService.aiFreeModelChat({ message: "Hi", history: [] });

    expect(result).toBe("Hi guest!");
    expect(mockedChat).toHaveBeenCalledWith("Hi", []);
  });

  it("throws conflict error when limit exceeded", async () => {
    mockedUser.findOne.mockResolvedValue({
      email: "user@example.com",
      subscriptionType: "free",
      requestsThisMonth: 100,
      lastRequestDate: new Date(),
    });
    mockedUser.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      AiModelService.aiModelChat(
        { message: "Hi", history: [] },
        { email: "user@example.com" } as any
      )
    ).rejects.toMatchObject({ statusCode: httpStatus.CONFLICT });
  });

  it("throws gateway timeout on timeout", async () => {
    mockedRace.mockRejectedValue(new GenerationTimeoutError());

    await expect(
      AiModelService.aiFreeModelChat({ message: "Hi", history: [] })
    ).rejects.toMatchObject({ statusCode: httpStatus.GATEWAY_TIMEOUT });
  });
});
