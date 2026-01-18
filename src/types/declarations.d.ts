// Type declarations for modules without TypeScript definitions

declare module 'authorizenet' {
  export const APIContracts: {
    MerchantAuthenticationType: new () => {
      setName(name: string): void;
      setTransactionKey(key: string): void;
    };
    CreditCardType: new () => {
      setCardNumber(num: string): void;
      setExpirationDate(date: string): void;
      setCardCode(code: string): void;
    };
    PaymentType: new () => {
      setCreditCard(card: unknown): void;
    };
    OrderType: new () => {
      setInvoiceNumber(num: string): void;
      setDescription(desc: string): void;
    };
    CustomerDataType: new () => {
      setEmail(email: string): void;
    };
    TransactionRequestType: new () => {
      setTransactionType(type: unknown): void;
      setPayment(payment: unknown): void;
      setAmount(amount: number): void;
      setOrder(order: unknown): void;
      setCustomer(customer: unknown): void;
      setRefTransId(id: string): void;
    };
    CreateTransactionRequest: new () => {
      setMerchantAuthentication(auth: unknown): void;
      setTransactionRequest(req: unknown): void;
      getJSON(): unknown;
    };
    CreateTransactionResponse: new (response: unknown) => {
      getMessages(): {
        getResultCode(): unknown;
        getMessage(): Array<{ getText(): string }>;
      };
      getTransactionResponse(): {
        getTransId(): string;
        getAuthCode(): string;
        getResponseCode(): string;
        getAvsResultCode(): string;
      } | null;
    };
    GetTransactionDetailsRequest: new () => {
      setMerchantAuthentication(auth: unknown): void;
      setTransId(id: string): void;
      getJSON(): unknown;
    };
    GetTransactionDetailsResponse: new (response: unknown) => {
      getMessages(): {
        getResultCode(): unknown;
        getMessage(): Array<{ getText(): string }>;
      };
      getTransaction(): {
        getTransId(): string;
        getTransactionStatus(): string;
        getSettleAmount(): number;
        getSubmitTimeUTC(): string;
        getResponseCode(): number;
      };
    };
    CustomerProfileType: new () => {
      setEmail(email: string): void;
      setDescription(desc: string): void;
    };
    CreateCustomerProfileRequest: new () => {
      setMerchantAuthentication(auth: unknown): void;
      setProfile(profile: unknown): void;
      getJSON(): unknown;
    };
    CreateCustomerProfileResponse: new (response: unknown) => {
      getMessages(): {
        getResultCode(): unknown;
        getMessage(): Array<{ getText(): string }>;
      };
      getCustomerProfileId(): string;
    };
    GetMerchantDetailsRequest: new () => {
      setMerchantAuthentication(auth: unknown): void;
      getJSON(): unknown;
    };
    GetMerchantDetailsResponse: new (response: unknown) => {
      getMessages(): {
        getResultCode(): unknown;
        getMessage(): Array<{ getText(): string }>;
      };
    };
    TransactionTypeEnum: {
      AUTHCAPTURETRANSACTION: unknown;
      AUTHONLYTRANSACTION: unknown;
      PRIORAUTHCAPTURETRANSACTION: unknown;
      REFUNDTRANSACTION: unknown;
      VOIDTRANSACTION: unknown;
    };
    MessageTypeEnum: {
      OK: unknown;
    };
  };

  export const APIControllers: {
    CreateTransactionController: new (request: unknown) => {
      setEnvironment(env: string): void;
      execute(callback: () => void): void;
      getResponse(): unknown;
    };
    GetTransactionDetailsController: new (request: unknown) => {
      setEnvironment(env: string): void;
      execute(callback: () => void): void;
      getResponse(): unknown;
    };
    CreateCustomerProfileController: new (request: unknown) => {
      setEnvironment(env: string): void;
      execute(callback: () => void): void;
      getResponse(): unknown;
    };
    GetMerchantDetailsController: new (request: unknown) => {
      setEnvironment(env: string): void;
      execute(callback: () => void): void;
      getResponse(): unknown;
    };
  };

  export const Constants: {
    endpoint: {
      sandbox: string;
      production: string;
    };
  };
}
