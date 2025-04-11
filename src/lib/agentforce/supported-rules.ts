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
 * Map containing the rules that we support with A4D Quick Fix to the associated ViolationContextScope
 */
export const A4D_SUPPORTED_RULES: Map<string, ViolationContextScope> = new Map([
    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Recommended:ErrorProne:Apex'
    // =======================================================================
    ['AvoidDirectAccessTriggerMap', ViolationContextScope.ViolationScope],
    ['AvoidHardcodingId', ViolationContextScope.ViolationScope],
    ['AvoidNonExistentAnnotations', ViolationContextScope.ViolationScope],
    ['EmptyCatchBlock', ViolationContextScope.MethodScope],
    ['EmptyIfStmt', ViolationContextScope.MethodScope],
    ['EmptyStatementBlock', ViolationContextScope.MethodScope],
    ['EmptyTryOrFinallyBlock', ViolationContextScope.ViolationScope],
    ['EmptyWhileStmt', ViolationContextScope.ViolationScope],
    ['InaccessibleAuraEnabledGetter', ViolationContextScope.MethodScope],
    ['MethodWithSameNameAsEnclosingClass', ViolationContextScope.ClassScope],
    ['OverrideBothEqualsAndHashcode', ViolationContextScope.ViolationScope],
    ['TestMethodsMustBeInTestClasses', ViolationContextScope.ClassScope],

    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Recommended:Security:Apex'
    // =======================================================================
    ['ApexBadCrypto', ViolationContextScope.MethodScope],
    ['ApexCRUDViolation', ViolationContextScope.ViolationScope],
    ['ApexCSRF', ViolationContextScope.ViolationScope],
    ['ApexDangerousMethods', ViolationContextScope.ViolationScope],
    ['ApexInsecureEndpoint', ViolationContextScope.MethodScope],
    ['ApexOpenRedirect', ViolationContextScope.MethodScope],
    ['ApexSharingViolations', ViolationContextScope.ViolationScope],
    ['ApexSOQLInjection', ViolationContextScope.MethodScope],
    ['ApexSuggestUsingNamedCred', ViolationContextScope.MethodScope],
    ['ApexXSSFromEscapeFalse', ViolationContextScope.ViolationScope],
    ['ApexXSSFromURLParam', ViolationContextScope.ViolationScope],
]);
