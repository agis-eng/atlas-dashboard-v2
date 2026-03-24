declare module 'dav' {
  export default dav;
  
  namespace dav {
    export namespace transport {
      export class Basic {
        constructor(credentials: Credentials);
      }
    }
    
    export class Credentials {
      constructor(options: { username: string; password: string });
    }
    
    export function createAccount(options: {
      server: string;
      xhr: any;
      accountType: string;
    }): Promise<any>;
    
    export function listCalendarObjects(calendar: any, options: any): Promise<any[]>;
    
    export function createCalendarObject(calendar: any, options: {
      filename: string;
      data: string;
      xhr: any;
    }): Promise<any>;
  }
}
