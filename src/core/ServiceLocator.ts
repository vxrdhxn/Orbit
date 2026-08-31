import * as vscode from 'vscode';
import { SmartClient } from '../providers/SmartClient';
import { ChatProvider } from '../ChatProvider';
import { LLMRouter } from '../reasoning/LLMRouter';
import { ResponseFormatter } from '../reasoning/ResponseFormatter';
import { SQLiteMemory } from '../memory/SQLiteMemory';
import { DecisionJournal } from '../memory/DecisionJournal';
import { GitJournalSyncService } from '../memory/GitJournalSyncService';
import { EnhancedDiffEngine } from '../services/EnhancedDiffEngine';
import { ApprovalManager } from '../services/ApprovalManager';
import { DiffApprovalView } from '../ui/DiffApprovalView';
import { PerformanceAnalyzer } from '../performance/PerformanceAnalyzer';
import { SimpleIndex } from '../store';
import { ContextGatherer } from '../reviewContext';
import { EnhancedReviewService } from '../services/EnhancedReviewService';
import { PresetManager } from '../reviewPresets';
import { AnnotationManager } from '../reviewAnnotations';
import { ReviewCommand } from '../reviewCommand';
import { AutoFixEngine } from '../services/AutoFixEngine';
import { BackgroundAnalyzer } from '../services/BackgroundAnalyzer';
import { EnhancedContextCollector } from '../context/EnhancedContextCollector';
import { DecisionHistoryView } from '../ui/DecisionHistoryView';
import { ReviewCodeLensProvider } from '../reviewCodeLens';
import { CompletionProvider } from '../completionProvider';
import { FindingCategory, SeverityLevel } from '../reviewTypes';

export class ServiceLocator {
    // Global Services
    public formatter!: ResponseFormatter;
    public router!: LLMRouter;
    public llmClient!: SmartClient;
    public chatProvider!: ChatProvider;
    
    // Workspace Services
    public sqliteMemory?: SQLiteMemory;
    public decisionJournal?: DecisionJournal;
    public syncService?: GitJournalSyncService;
    public diffEngine?: EnhancedDiffEngine;
    public approvalManager?: ApprovalManager;
    public diffApprovalView?: DiffApprovalView;
    public performanceAnalyzer?: PerformanceAnalyzer;
    public index?: SimpleIndex;
    public contextGatherer?: ContextGatherer;
    public reviewService?: EnhancedReviewService;
    public presetManager?: PresetManager;
    public annotationManager?: AnnotationManager;
    public reviewCommand?: ReviewCommand;
    public autoFixEngine?: AutoFixEngine;
    public pilotAnalyzer?: BackgroundAnalyzer;
    public contextCollector?: EnhancedContextCollector;
    public historyView?: DecisionHistoryView;
    public codeLensProvider?: ReviewCodeLensProvider;
    public completionProvider?: CompletionProvider;

    public initGlobalServices(context: vscode.ExtensionContext) {
        this.formatter = new ResponseFormatter();
        this.router = new LLMRouter(this.formatter, { maxRetries: 2, enforceFormat: true });
        this.llmClient = new SmartClient();
        this.chatProvider = new ChatProvider(context, this.llmClient, this.router);
    }

    public initWorkspaceServices(context: vscode.ExtensionContext, workspaceFolder: vscode.Uri) {
        // Memory System
        this.sqliteMemory = new SQLiteMemory(workspaceFolder.fsPath);
        this.sqliteMemory.initialize();
        context.subscriptions.push({ dispose: () => this.sqliteMemory?.close() });
        this.decisionJournal = new DecisionJournal(this.sqliteMemory);

        // Sync & Collaboration
        this.syncService = new GitJournalSyncService(this.decisionJournal, workspaceFolder.fsPath);
        this.syncService.activate(context.subscriptions);

        // Diff & Approval System
        this.diffEngine = new EnhancedDiffEngine(this.llmClient, this.router);
        this.approvalManager = new ApprovalManager(this.decisionJournal);
        this.diffApprovalView = new DiffApprovalView(context.extensionUri,
            (ids) => this.approvalManager?.approve(ids) || Promise.resolve(),
            () => this.approvalManager?.reject() || Promise.resolve()
        );

        // Performance Analyzer
        this.performanceAnalyzer = new PerformanceAnalyzer(this.llmClient, this.router, this.formatter);

        // Review System
        this.index = new SimpleIndex(workspaceFolder);
        this.contextGatherer = new ContextGatherer(this.index);
        const reviewConfig = {
            enabledCategories: [FindingCategory.Bug, FindingCategory.Security, FindingCategory.Performance],
            minSeverity: SeverityLevel.Info,
            includeContext: true,
            maxFindings: 20,
            autoApplyFixes: false
        };
        this.reviewService = new EnhancedReviewService(this.llmClient, this.contextGatherer, reviewConfig, this.router);

        this.presetManager = new PresetManager(context);
        this.annotationManager = new AnnotationManager();
        this.reviewCommand = new ReviewCommand(this.reviewService, this.presetManager);

        // Pilot Components
        this.autoFixEngine = new AutoFixEngine(this.decisionJournal);
        this.pilotAnalyzer = new BackgroundAnalyzer(this.reviewService, this.autoFixEngine);
        this.pilotAnalyzer.activate(context.subscriptions);

        // UI Providers
        this.contextCollector = new EnhancedContextCollector(this.decisionJournal, this.index);
        this.historyView = new DecisionHistoryView(
            context.extensionUri,
            (filePath) => {
                const uri = vscode.Uri.file(filePath);
                vscode.workspace.openTextDocument(uri).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            },
            (offset: number) => {
                const projectId = vscode.workspace.name || 'default-project';
                return this.decisionJournal!.getRecentDecisions(projectId, 50, offset);
            }
        );
        this.codeLensProvider = new ReviewCodeLensProvider(this.annotationManager);
        this.completionProvider = new CompletionProvider(this.llmClient);
    }
}
