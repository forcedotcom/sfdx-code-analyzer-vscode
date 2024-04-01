import { Display } from '@salesforce/sfdx-scanner/lib/lib/Display';
import { Ux } from "@salesforce/sf-plugins-core";
import {AnyJson} from "@salesforce/ts-types";


export class VSCodeDisplay implements Display {
    private stdout:string[] = [];
    private stderr:string[] = [];
    
    displayInfo(msg: string): void {
        this.stdout.push(msg);
    }

    displayVerboseInfo(msg: string): void {
        this.stdout.push(msg);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    displayConfirmationPrompt(msg: string): Promise<boolean> {
        throw new Error('Method not implemented');
    }

    displayStyledHeader(headerText: string): void {
        this.stdout.push(headerText);
    }

    displayError(msg: string): void {
        this.stderr.push(msg);
    }

    displayWarning(msg: string): void {
        this.stderr.push(msg);
    }

    displayVerboseWarning(msg: string): void {
        this.stderr.push(msg);
    }

    displayUniqueWarning(msg: string): void {
        this.stderr.push(msg);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    spinnerStart(msg: string, status?: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    spinnerUpdate(status: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    spinnerWait(): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    spinnerStop(msg: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayTable<R extends Ux.Table.Data>(data: R[], columns: Ux.Table.Columns<R>): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    public displayStyledObject(obj: AnyJson): void {
	}

    public getInfo(): string[] {
        return this.stdout;
    }

    public getErrorsAndWarnings(): string [] {
        return this.stderr;
    }
 }