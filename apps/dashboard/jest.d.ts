/// <reference types="@types/jest" />
/// <reference types="@testing-library/jest-dom" />

// Extend global namespace for Jest
declare global {
  const describe: jest.Describe;
  const it: jest.It;
  const test: jest.It;
  const expect: jest.Expect;
  const beforeEach: jest.Lifecycle;
  const afterEach: jest.Lifecycle;
  const beforeAll: jest.Lifecycle;
  const afterAll: jest.Lifecycle;
  
  namespace jest {
    interface Mock<T = any, Y extends any[] = any> extends Function {
      (...args: Y): T;
      mockReturnValue(value: T): this;
      mockResolvedValue(value: T): this;
      mockRejectedValue(error: any): this;
      mockImplementation(fn: (...args: Y) => T): this;
      mockClear(): void;
      mockReset(): void;
    }
  }
}

export {};

