declare module 'ical.js' {
  export default ical;
  
  namespace ical {
    export function parse(data: string): any;
    
    export class Component {
      constructor(data: any);
      getFirstSubcomponent(name: string): any;
      addSubcomponent(component: any): void;
      updatePropertyWithValue(name: string, value: string): void;
      toString(): string;
    }
    
    export class Event {
      constructor(component: any);
      uid: string;
      summary: string;
      description: string;
      location: string;
      startDate: Time;
      endDate: Time;
    }
    
    export class Time {
      static fromJSDate(date: Date, isDate?: boolean): Time;
      isDate: boolean;
      toJSDate(): Date;
    }
  }
}
