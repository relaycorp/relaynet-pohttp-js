import envVar from 'env-var';

export async function expectPromiseToReject(
  promise: Promise<any>,
  expectedError: Error,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toHaveProperty('message', expectedError.message);
    expect(error).toBeInstanceOf(expectedError.constructor);
    return;
  }
  throw new Error(`Expected promise to throw error ${expectedError}`);
}

export function getMockContext(mockedObject: any): jest.MockContext<any, any> {
  const mockInstance = (mockedObject as unknown) as jest.MockInstance<any, any>;
  return mockInstance.mock;
}

export function mockEnvVars(envVars: { readonly [key: string]: string | undefined }): void {
  jest.spyOn(envVar, 'get').mockImplementation((...args: readonly any[]) => {
    const originalEnvVar = jest.requireActual('env-var');
    const env = originalEnvVar.from(envVars);

    return env.get(...args);
  });
}
