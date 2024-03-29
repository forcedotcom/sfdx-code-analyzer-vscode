import { Display, Displayable } from '@salesforce/sfdx-scanner/lib/lib/Display';
import {Spinner, Ux} from "@salesforce/sf-plugins-core";
import {AnyJson} from "@salesforce/ts-types";


export class NoOpDisplay implements Display {
    private readonly displayable: Displayable;
	private readonly spinner: Spinner;
	private readonly isVerboseSet: boolean;
    
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayInfo(msg: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayVerboseInfo(msg: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayConfirmationPrompt(msg: string): Promise<boolean> {
        throw new Error('Method not implemented');
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayStyledHeader(headerText: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayError(msg: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayWarning(msg: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayVerboseWarning(msg: string): void {
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    displayUniqueWarning(msg: string): void {
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

    public displayStyledObject(obj: AnyJson): void {
		this.displayable.styledObject(obj);
	}
}