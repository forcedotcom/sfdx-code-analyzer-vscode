/**
 * The scope of the context that a rule should send into the LLM
 */
export enum ViolationContextScope {
    // The class scope is used when we need to send in all the lines associated with the class that contains the violation
    ClassScope = 'ClassScope',

    // The method scope is used when we need to send in all the lines associated with the method that contains the violation
    MethodScope = 'MethodScope',

    // The violation scope is used when it is sufficient to just send in the violating lines without additional context
    ViolationScope = 'ViolationScope'
}

/**
 * Rule information used for A4D Quick fixes to associate a rule to a description and {@link ViolationContextScope}
 */
export type RuleInfo = {
    description: string
    violationContextScope: ViolationContextScope
}

/**
 * Map containing the rules that we support with A4D Quick Fix to the associated {@link RuleInfo} instance
 *
 * Note: Until we move to using the node api of Code Analyzer v5, we would either have to get the rule descriptions
 *       from the CLI, or from a hard coded map. For now, we just hard code them for the rules we support.
 *       // TODO: Replace with a more scalable solution
 */
export const A4D_SUPPORTED_RULES: Map<string, RuleInfo> = new Map([

    /* === Rules from rule selector: 'pmd:Recommended:ErrorProne:Apex' === */
    ['AvoidDirectAccessTriggerMap', {
        description: 'Avoid directly accessing Trigger.old and Trigger.new as it can lead to a bug. Triggers should be bulkified and iterate through the map to handle the actions for each item separately.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['AvoidHardcodingId', {
        description: 'When deploying Apex code between sandbox and production environments, or installing Force.com AppExchange packages, it is essential to avoid hardcoding IDs in the Apex code. By doing so, if the record IDs change between environments, the logic can dynamically identify the proper data to operate against and not fail.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['AvoidNonExistentAnnotations', {
        description: 'Apex supported non existent annotations for legacy reasons. In the future, use of such non-existent annotations could result in broken apex code that will not compile. This will prevent users of garbage annotations from being able to use legitimate annotations added to Apex in the future.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['EmptyCatchBlock', {
        description: 'Empty Catch Block finds instances where an exception is caught, but nothing is done. In most circumstances, this swallows an exception which should either be acted on or reported.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['EmptyIfStmt', {
        description: 'Empty If Statement finds instances where a condition is checked but nothing is done about it.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['EmptyStatementBlock', {
        description: 'Empty block statements serve no purpose and should be removed.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['EmptyTryOrFinallyBlock', {
        description: 'Avoid empty try or finally blocks - what\'s the point?',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['EmptyWhileStmt', {
        description: 'Empty While Statement finds all instances where a while statement does nothing. If it is a timing loop, then you should use Thread.sleep() for it; if it is a while loop that does a lot in the exit expression, rewrite it to make it clearer.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['InaccessibleAuraEnabledGetter', {
        description: 'In the Summer \'21 release, a mandatory security update enforces access modifiers on Apex properties in Lightning component markup. The update prevents access to private or protected Apex getters from Aura and Lightning Web Components.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['MethodWithSameNameAsEnclosingClass', {
        description: 'Non-constructor methods should not have the same name as the enclosing class.',
        violationContextScope: ViolationContextScope.ClassScope
    }],
    ['OverrideBothEqualsAndHashcode', {
        description: 'Override both `public Boolean equals(Object obj)`, and `public Integer hashCode()`, or override neither. Even if you are inheriting a hashCode() from a parent class, consider implementing hashCode and explicitly delegating to your superclass. This is especially important when Using Custom Types in Map Keys and Sets.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['TestMethodsMustBeInTestClasses', {
        description: 'Test methods marked as a testMethod or annotated with @IsTest, but not residing in a test class should be moved to a proper class or have the @IsTest annotation added to the class. Support for tests inside functional classes was removed in Spring-13 (API Version 27.0), making classes that violate this rule fail compile-time. This rule is mostly usable when dealing with legacy code.',
        violationContextScope: ViolationContextScope.ClassScope
    }],


    /* === Rules from rule selector: 'pmd:Recommended:Security:Apex' === */
    ['ApexBadCrypto', {
        description: 'The rule makes sure you are using randomly generated IVs and keys for `Crypto` calls. Hard-wiring these values greatly compromises the security of encrypted data.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['ApexCRUDViolation', {
        description: 'The rule validates you are checking for access permissions before a SOQL/SOSL/DML operation. Since Apex runs by default in system mode not having proper permissions checks results in escalation of privilege and may produce runtime errors. This check forces you to handle such scenarios. Since Winter \'23 (API Version 56) you can enforce user mode for database operations by using `WITH USER_MODE`...',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['ApexCSRF', {
        description: 'Having DML operations in Apex class constructor or initializers can have unexpected side effects: By just accessing a page, the DML statements would be executed and the database would be modified. Just querying the database is permitted. In addition to constructors and initializers, any method called `init` is checked as well. Salesforce Apex already protects against this scenario and raises a runtime...',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['ApexDangerousMethods', {
        description: 'Checks against calling dangerous methods. For the time being, it reports: * Against `FinancialForce`\'s `Configuration.disableTriggerCRUDSecurity()`. Disabling CRUD security opens the door to several attacks and requires manual validation, which is unreliable. * Calling `System.debug` passing sensitive data as parameter, which could lead to exposure of private data.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['ApexInsecureEndpoint', {
        description: 'Checks against accessing endpoints under plain **http**. You should always use **https** for security.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['ApexOpenRedirect', {
        description: 'Checks against redirects to user-controlled locations. This prevents attackers from redirecting users to phishing sites.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['ApexSharingViolations', {
        description: 'Detect classes declared without explicit sharing mode if DML methods are used. This forces the developer to take access restrictions into account before modifying objects.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['ApexSOQLInjection', {
        description: 'Detects the usage of untrusted / unescaped variables in DML queries.',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['ApexSuggestUsingNamedCred', {
        description: 'Detects hardcoded credentials used in requests to an endpoint. You should refrain from hardcoding credentials: * They are hard to mantain by being mixed in application code * Particularly hard to update them when used from different classes * Granting a developer access to the codebase means granting knowledge of credentials, keeping a two-level access is not possible. * Using different...',
        violationContextScope: ViolationContextScope.MethodScope
    }],
    ['ApexXSSFromEscapeFalse', {
        description: 'Reports on calls to `addError` with disabled escaping. The message passed to `addError` will be displayed directly to the user in the UI, making it prime ground for XSS attacks if unescaped.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
    ['ApexXSSFromURLParam', {
        description: 'Makes sure that all values obtained from URL parameters are properly escaped / sanitized to avoid XSS attacks.',
        violationContextScope: ViolationContextScope.ViolationScope
    }],
]);
