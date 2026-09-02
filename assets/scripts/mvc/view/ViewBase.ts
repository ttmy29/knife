import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

@ccclass('ViewBase')
export class ViewBase extends Component {
    show(): void {
        this.node.active = true;
    }

    hide(): void {
        this.node.active = false;
    }
}

