import { Component, DoCheck, IterableDiffers, OnInit, ViewChild, OnDestroy, Input, IterableDiffer, SimpleChanges, OnChanges, Output, EventEmitter, KeyValueDiffer, KeyValueDiffers } from '@angular/core';
import { BsModalService, ModalDirective } from 'ngx-bootstrap';

import { ApiService } from '../api/api.service';
import { TimeIntervalsService } from '../pages/timeintervals/timeintervals.service';
import { AllowedActionsService } from '../pages/roles/allowed-actions.service';

import { ItemsListComponent } from '../pages/items.list.component';

import { Screenshot } from '../models/screenshot.model';
import { User } from '../models/user.model';
import { TimeInterval } from '../models/timeinterval.model';

import * as moment from 'moment';
import 'moment-timezone';
import { ScreenshotsService } from '../pages/screenshots/screenshots.service';

@Component({
    selector: 'screenshot-list',
    templateUrl: './screenshot-list.component.html',
    styleUrls: ['./screenshot-list.component.scss']
})
export class ScreenshotListComponent extends ItemsListComponent implements OnInit, DoCheck, OnChanges, OnDestroy {
    @ViewChild('loading') loading: any;
    @ViewChild('screenshotModal') screenshotModal: ModalDirective;

    @Input() initialLoad: boolean = true;
    @Input() autoload: boolean = true;

    @Input() showTime: boolean = false;
    @Input() showDate: boolean = true;
    @Input() showUser: boolean = true;
    @Input() showProject: boolean = true;
    @Input() showTask: boolean = true;
    @Input() showSelection: boolean = false;

    @Input() user_ids?: number[] = null;
    @Input() project_ids?: number[] = null;
    @Input() task_ids?: number[] = null;
    @Input() max_date: string = '';
    @Input() min_date: string = '';
    @Input() date_output_format: string = 'DD.MM.YYYY HH:mm:ss';

    @Output() onSelectionChanged = new EventEmitter<TimeInterval[]>();

    differUsers: IterableDiffer<number[]>;
    differProjects: IterableDiffer<number[]>;
    differTasks: IterableDiffer<number[]>;

    chunksize = 32;
    offset = 0;
    screenshotLoading = false;
    scrollHandler: any = null;
    countFail = 0;
    isAllLoaded = false;
    isLoading = false;

    selected: { [key: number]: boolean } = {};
    selectedDiffer: KeyValueDiffer<number, boolean> = null;
    selectedIntervals: TimeInterval[] = [];

    modalScreenshot?: Screenshot = null;

    user: User;

    protected _itemsChunked = [];
    get itemsChunked() {
        if (this._itemsChunked.length > 0) {
            return this._itemsChunked;
        }

        const result = [];
        const chunkSize = 12;
        for (let i = 0, len = this.itemsArray.length; i < len; i += chunkSize) {
            result.push(this.itemsArray.slice(i, i + chunkSize));
        }

        return this._itemsChunked = result;
    }

    constructor(protected api: ApiService,
        protected intervalService: TimeIntervalsService,
        protected screenshotService: ScreenshotsService,
        protected modalService: BsModalService,
        protected allowedAction: AllowedActionsService,
        protected differs: IterableDiffers,
        protected kvDiffers: KeyValueDiffers,
    ) {
        super(api, intervalService, modalService, allowedAction);
        this.user = api.getUser();
        this.differUsers = differs.find([]).create(null);
        this.differProjects = differs.find([]).create(null);
        this.differTasks = differs.find([]).create(null);
        this.selectedDiffer = kvDiffers.find(this.selected).create();
    }

    ngOnInit() {
        this.scrollHandler = this.onScrollDown.bind(this);
        window.addEventListener('scroll', this.scrollHandler, false);
        if (this.initialLoad || this.autoload) {
            this.loadNext();
        }
    }

    protected getSelectedScreenshots() {
        const screenshots = this.itemsArray as Screenshot[];
        return screenshots.filter(item => this.selected[item.id]);
    }

    ngDoCheck() {
        const changeUserIds = this.differUsers.diff([this.user_ids]);
        const changeProjectIds = this.differProjects.diff([this.project_ids]);
        const changeTaskIds = this.differTasks.diff([this.task_ids]);

        if (changeUserIds || changeProjectIds || changeTaskIds) {
            this.reload();
        }

        const selectedChanged = this.selectedDiffer.diff(this.selected);
        if (selectedChanged) {
            this.selectedIntervals = this.getSelectedScreenshots()
                // Get time intervals of the selected screenshots.
                .map(screenshot => screenshot.time_interval);
            this.onSelectionChanged.emit(this.selectedIntervals);
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes.min_date && !changes.min_date.firstChange
            || changes.max_date && !changes.max_date.firstChange
            || changes.autoload && !changes.autoload.firstChange) {
            this.reload();
        }
    }

    cleanupParams() : string[] {
        return [
            'loading',
            'screenshotModal',
            'initialLoad',
            'autoload',
            'showTime',
            'showDate',
            'showUser',
            'showProject',
            'showTask',
            'showSelection',
            'user_ids',
            'project_ids',
            'task_ids',
            'max_date',
            'min_date',
            'date_output_format',
            'onSelectionChanged',
            'differUsers',
            'differProjects',
            'differTasks',
            'chunksize',
            'offset',
            'screenshotLoading',
            'scrollHandler',
            'countFail',
            'isAllLoaded',
            'isLoading',
            'selected',
            'selectedDiffer',
            'selectedIntervals',
            'modalScreenshot',
            'user',
            '_itemsChunked',
            'api',
            'intervalService',
            'screenshotService',
            'modalService',
            'allowedAction',
            'differs',
            'kvDiffers',
        ];
    }


    ngOnDestroy() {
        window.removeEventListener('scroll', this.scrollHandler, false);

        for (let param of this.cleanupParams()) {
            delete this[param];
        }
    }

    onScrollDown() {
        if (!this.autoload) {
            return;
        }

        const block_Y_position = this.loading.nativeElement.offsetTop;
        const scroll_Y_top_position = window.scrollY;
        const windowHeight = window.innerHeight;
        const bottom_scroll_Y_position = scroll_Y_top_position + windowHeight;

        if (bottom_scroll_Y_position < block_Y_position) { // loading new screenshots doesn't needs
            return;
        }

        this.loadNext();
    }

    setItems(items) {
        super.setItems(items);
        this._itemsChunked = [];
    }

    formatDate(datetime?: string) {
        if (!datetime) {
            return null;
        }

        return moment.utc(datetime).local().format(this.date_output_format);
    }

    loadNext() {
        if (this.screenshotLoading || this.countFail > 3) {
            return;
        }

        const params = {
            'with': 'screenshots,task,task.project,user',
            'limit': this.chunksize,
            'offset': this.offset,
            'order_by': ['id', 'desc'],
        };

        if (this.user_ids && this.user_ids.length) {
            params['user_id'] = ['=', this.user_ids];
        }

        if (this.project_ids && this.project_ids.length) {
            params['project_id'] = ['=', this.project_ids];
        }

        if (this.task_ids && this.task_ids.length) {
            params['task_id'] = ['=', this.task_ids];
        }

        if (this.max_date && !this.min_date && this.max_date.length) {
            const date = moment(this.max_date, 'DD-MM-YYYY').utc().add(1, 'day').format('YYYY-MM-DD HH:mm:ss');
            params['start_at'] = ['<=', date];
        }

        if (this.min_date && !this.max_date && this.min_date.length) {
            const date = moment(this.min_date, 'DD-MM-YYYY').utc().format('YYYY-MM-DD HH:mm:ss');
            params['end_at'] = ['>=', date];
        }

        if (this.min_date && this.max_date && this.min_date.length && this.max_date.length) {
            let startDate = moment(this.min_date, 'DD-MM-YYYY').utc();
            let endDate = moment(this.max_date, 'DD-MM-YYYY').utc().add(1, 'day');
            if (startDate.diff(endDate) > 0) {
                [startDate, endDate] = [endDate, startDate];
            }
            const start = startDate.format('YYYY-MM-DD HH:mm:ss');
            const end = endDate.format('YYYY-MM-DD HH:mm:ss');
            params['end_at'] = ['>=', start];
            params['start_at'] = ['<=', end];
        }

        this.screenshotLoading = true;
        try {
            this.isLoading = true;
            this.intervalService.getItems((intervals: TimeInterval[]) => {
                if (intervals.length > 0) {
                    const screenshots = intervals.reduce((total, interval) => {
                        if (interval.screenshots.length) {
                            const intervalScreenshots = interval.screenshots.map(screenshot => {
                                screenshot.time_interval = interval;
                                return screenshot;
                            });
                            return total.concat(intervalScreenshots);
                        } else {
                            // Add empty screenshot to the screenshot list, if interval haven't screenshots.
                            const screenshot = new Screenshot({
                                id: 0,
                                time_interval: interval,
                                path: '',
                            });
                            return total.concat([screenshot]);
                        }
                    }, []);
                    this.setItems(this.itemsArray.concat(screenshots));
                    this.offset += this.chunksize;
                } else {
                    this.countFail += 1;
                }

                this.isAllLoaded = intervals.length < this.chunksize;
                this.screenshotLoading = false;
                this.isLoading = false;
            }, params);
        } catch {
            this.countFail += 1;
            this.screenshotLoading = false;
            this.isLoading = false;
        }
    }

    reload() {
        this.offset = 0;
        this.setItems([]);
        this.countFail = 0;
        this.isAllLoaded = false;
        if (this.initialLoad || this.autoload) {
            this.loadNext();
        }
    }

    showModal(screenshot: Screenshot) {
        this.modalScreenshot = screenshot;
        this.screenshotModal.show();
    }

    showPrev() {
        const items = this.itemsArray as Screenshot[];
        const index = items.findIndex(screenshot => screenshot.time_interval.id
            === this.modalScreenshot.time_interval.id);

        if (index > 0) {
            this.modalScreenshot = items[index - 1];
        }
    }

    showNext() {
        const items = this.itemsArray as Screenshot[];
        const index = items.findIndex(screenshot => screenshot.time_interval.id
            === this.modalScreenshot.time_interval.id);

        if (index !== -1 && index < items.length - 1) {
            this.modalScreenshot = items[index + 1];
        }
    }

    delete(screenshot: Screenshot) {
        this.screenshotService.removeItem(screenshot.id, () => {
            const items = this.itemsArray as Screenshot[];
            const index = items.findIndex(scr => scr.id === screenshot.id);
            screenshot.path = '';
            screenshot.thumbnail_path = '';

            if (index !== -1 && index < items.length - 1) {
                this.modalScreenshot = items[index + 1];
            } else if (index > 0) {
                this.modalScreenshot = items[index - 1];
            } else {
                this.screenshotModal.hide();
            }
        });
    }

    groupTrackFn(i, el) {
        return i;
    }

    screenshotTrackFn(i, el: Screenshot) {
        return el.id;
    }
}
