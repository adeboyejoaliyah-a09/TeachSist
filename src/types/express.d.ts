declare global {
  namespace Express {
    interface Locals {
      teacherId: string;
      requestId: string;
    }
  }
}

export {};
