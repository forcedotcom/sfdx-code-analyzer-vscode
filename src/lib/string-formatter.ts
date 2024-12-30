export class StringFormatter {
  private template: string;

  constructor(template: string) {
    this.template = template;
  }

  substitute(...values: string[]): string {
    let result = this.template;
    values.forEach((value) => {
      result = result.replace("%s", value);
    });
    return result;
  }
}