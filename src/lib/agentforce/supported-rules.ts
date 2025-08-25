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
    // ==== Rules from rule selector: 'pmd:Documentation:Apex'
    // =======================================================================
    ['ApexDoc', ViolationContextScope.MethodScope],


    // =======================================================================
    // ==== Rules from rule selector: 'pmd:BestPractices:Apex'
    // =======================================================================
    ['ApexAssertionsShouldIncludeMessage', ViolationContextScope.ViolationScope],
    ['ApexUnitTestMethodShouldHaveIsTestAnnotation', ViolationContextScope.ClassScope],
    ['ApexUnitTestShouldNotUseSeeAllDataTrue', ViolationContextScope.ClassScope], // Range really should just be the violation but see ApexUnitTestShouldNotUseSeeAllDataTrue
    ['UnusedLocalVariable', ViolationContextScope.ViolationScope],
    // NOTE: We have decided that the following `BestPractices` rules either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   ApexUnitTestClassShouldHaveAsserts, ApexUnitTestClassShouldHaveRunAs, AvoidGlobalModifier, AvoidLogicInTrigger,
    //   DebugsShouldUseLoggingLevel, QueueableWithoutFinalizer

    // =======================================================================
    // ==== Rules from rule selector: 'pmd:CodeStyle:Apex'
    // =======================================================================
    ['ClassNamingConventions', ViolationContextScope.ViolationScope],
    ['FieldDeclarationsShouldBeAtStart', ViolationContextScope.ClassScope],
    ['FieldNamingConventions', ViolationContextScope.ViolationScope],
    ['ForLoopsMustUseBraces', ViolationContextScope.ViolationScope],
    ['FormalParameterNamingConventions', ViolationContextScope.ViolationScope],
    ['LocalVariableNamingConventions', ViolationContextScope.ViolationScope],
    ['MethodNamingConventions', ViolationContextScope.ViolationScope],
    ['OneDeclarationPerLine', ViolationContextScope.ViolationScope],
    ['PropertyNamingConventions', ViolationContextScope.ViolationScope],
    // NOTE: We have decided that the following `CodeStyle` rules either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   IfElseStmtsMustUseBraces, IfStmtsMustUseBraces, WhileLoopsMustUseBraces


    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Design:Apex'
    // =======================================================================
    ['AvoidDeeplyNestedIfStmts', ViolationContextScope.MethodScope],
    // NOTE: We have decided that the following `Design` rules either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   CognitiveComplexity, CyclomaticComplexity, ExcessiveClassLength, ExcessiveParameterList, ExcessivePublicCount,
    //   NcssConstructorCount, NcssMethodCount, NcssTypeCount, StdCyclomaticComplexity, TooManyFields, UnusedMethod

    
    // =======================================================================
    // ==== Rules from rule selector: 'pmd:ErrorProne:Apex'
    // =======================================================================
    ['AvoidDirectAccessTriggerMap', ViolationContextScope.MethodScope],
    ['AvoidStatefulDatabaseResult', ViolationContextScope.ClassScope],
    ['InaccessibleAuraEnabledGetter', ViolationContextScope.MethodScope],
    ['MethodWithSameNameAsEnclosingClass', ViolationContextScope.MethodScope],
    ['OverrideBothEqualsAndHashcode', ViolationContextScope.ViolationScope],
    ['TestMethodsMustBeInTestClasses', ViolationContextScope.ClassScope],
    ['TypeShadowsBuiltInNamespace', ViolationContextScope.ViolationScope],
    // NOTE: We have decided that the following `ErrorProne` rules either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   AvoidHardcodingId, AvoidNonExistentAnnotations, EmptyCatchBlock, EmptyIfStmt, EmptyStatementBlock,
    //   EmptyTryOrFinallyBlock, EmptyWhileStmt


    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Performance:Apex'
    // =======================================================================
    // All the performance rules have yet to be evaluated.


    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Security:Apex'  (except AppExchange rules)
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
    ['ApexXSSFromURLParam', ViolationContextScope.ViolationScope],
    // NOTE: We have decided that the following `Security` rule(s) either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   ApexOpenRedirect

    // =======================================================================
    // ==== Rules from rule selector: 'pmd:Performance:Apex'
    // =======================================================================
    ['EagerlyLoadedDescribeSObjectResult', ViolationContextScope.ViolationScope],
    ['OperationWithHighCostInLoop', ViolationContextScope.MethodScope],
    ['OperationWithLimitsInLoop', ViolationContextScope.MethodScope],
    // NOTE: We have decided that the following `Performance` rule(s) either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   AvoidDebugStatements, AvoidNonRestrictiveQueries

    // =======================================================================
    // ==== Rules from rule selector: 'pmd:AppExchange:Apex'
    // =======================================================================
    ['AvoidGlobalInstallUninstallHandlers', ViolationContextScope.ClassScope]
    // NOTE: We have decided that the following `AppExchange` rule(s) either do not get any value from A4D Quick Fix
    // suggestions or that the model currently gives back poor suggestions:
    //   AvoidChangeProtectionUnprotected, AvoidGetInstanceWithTaint, AvoidHardcodedCredentialsInFieldDecls,
    //   AvoidHardcodedCredentialsInHttpHeader, AvoidHardcodedCredentialsInSetPassword,
    //   AvoidHardcodedCredentialsInVarAssign, AvoidHardcodedCredentialsInVarDecls, AvoidInvalidCrudContentDistribution,
    //   AvoidSecurityEnforcedOldApiVersion, AvoidUnauthorizedApiSessionIdInApex, AvoidUnauthorizedGetSessionIdInApex,
    //   AvoidUnsafePasswordManagementUse
]);
