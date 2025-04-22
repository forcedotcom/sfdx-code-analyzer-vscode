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
    // ==== Rules from rule selector: 'pmd:Recommended:Documentation:Apex'
    // =======================================================================
    ['ApexDoc', ViolationContextScope.MethodScope],


    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Recommended:ErrorProne:Apex'
    // =======================================================================
    ['AvoidDirectAccessTriggerMap', ViolationContextScope.MethodScope],
    ['InaccessibleAuraEnabledGetter', ViolationContextScope.MethodScope],
    ['OverrideBothEqualsAndHashcode', ViolationContextScope.ViolationScope],
    ['TestMethodsMustBeInTestClasses', ViolationContextScope.ClassScope],
    // NOTE: We have decided that the following `ErrorProne` rules either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   AvoidHardcodingId, AvoidNonExistentAnnotations, EmptyCatchBlock, EmptyIfStmt, EmptyStatementBlock,
    //   EmptyTryOrFinallyBlock, EmptyWhileStmt, MethodWithSameNameAsEnclosingClass


    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Recommended:Security:Apex'
    // =======================================================================
    ['ApexBadCrypto', ViolationContextScope.MethodScope],
    ['ApexCRUDViolation', ViolationContextScope.MethodScope],
    ['ApexCSRF', ViolationContextScope.MethodScope],
    ['ApexDangerousMethods', ViolationContextScope.ViolationScope],
    ['ApexInsecureEndpoint', ViolationContextScope.MethodScope],
    ['ApexSharingViolations', ViolationContextScope.ViolationScope],
    ['ApexSOQLInjection', ViolationContextScope.MethodScope],
    ['ApexSuggestUsingNamedCred', ViolationContextScope.MethodScope],
    ['ApexXSSFromEscapeFalse', ViolationContextScope.MethodScope],
    ['ApexXSSFromURLParam', ViolationContextScope.ViolationScope]
    // NOTE: We have decided that the following `Security` rule(s) either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   ApexOpenRedirect


    // NOTE: We still need to evaluate other rule categories, so more will come in future releases.
]);
